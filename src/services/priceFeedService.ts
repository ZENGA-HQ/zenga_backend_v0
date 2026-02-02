import axios from 'axios';

export interface PriceData {
    currency: string;
    price: number;
    timestamp: Date;
}

export class PriceFeedService {
    private static readonly COINGECKO_API = 'https://api.coingecko.com/api/v3';
    private static readonly CACHE_DURATION = 30000; // 30 seconds
    private static priceCache: Map<
        string,
        { price: number; timestamp: number }
    > = new Map();

    private static inflight: Map<string, Promise<number>> = new Map();
    private static MAX_CONCURRENT_REQUESTS = Number(process.env.COINGECKO_MAX_CONC || 2);
    private static currentRequests = 0;
    private static rateLimitedUntil = 0;

    // CoinGecko ID mappings
    private static readonly CURRENCY_IDS = {
        ETH: 'ethereum',
        BTC: 'bitcoin',
        SOL: 'solana',
        STRK: 'starknet',
        XLM: 'stellar',
        DOT: 'polkadot',
        USDT: 'tether',
    };

    /**
     * Get current price for a currency in USD
     */
    static async getPrice(currency: string): Promise<number> {
        const cacheKey = currency.toUpperCase();
        const now = Date.now();

        // Check cache first
        const cached = this.priceCache.get(cacheKey);
        if (cached && now - cached.timestamp < this.CACHE_DURATION) {
            return cached.price;
        }

        // If there's already an inflight request for this currency, reuse it
        if (this.inflight.has(cacheKey)) {
            return this.inflight.get(cacheKey)!;
        }

        const p = (async () => {
            try {
                // If we're currently rate-limited globally, return stale cache if possible
                if (Date.now() < this.rateLimitedUntil) {
                    const cachedWhenLimited = this.priceCache.get(cacheKey);
                    if (cachedWhenLimited) {
                        console.warn(`[PriceFeed] Global rate-limited, returning cached ${cacheKey}`);
                        return cachedWhenLimited.price;
                    }
                    throw new Error('Rate limited by CoinGecko');
                }

                // Special-case: USD
                if (cacheKey === 'USD') {
                    this.priceCache.set(cacheKey, { price: 1, timestamp: Date.now() });
                    return 1;
                }

                // Special-case: NGN (Nigerian Naira)
                if (cacheKey === 'NGN') {
                    return await this.getNGNPrice();
                }

                // Concurrency limiter
                while (this.currentRequests >= this.MAX_CONCURRENT_REQUESTS) {
                    await new Promise((r) => setTimeout(r, 50));
                }
                this.currentRequests++;

                try {
                    const coinId =
                        this.CURRENCY_IDS[cacheKey as keyof typeof this.CURRENCY_IDS];
                    if (!coinId) {
                        throw new Error(`Unsupported currency: ${currency}`);
                    }

                    const response = await axios.get(
                        `${this.COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`,
                        { timeout: 10000 }
                    );

                    const data = response.data as Record<
                        string,
                        Record<string, number>
                    >;
                    const price = data[coinId]?.usd;
                    if (!price) {
                        throw new Error(`Price not found for ${currency}`);
                    }

                    this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
                    console.log(`[PriceFeed] ${currency}: $${price}`);
                    return price;
                } finally {
                    this.currentRequests = Math.max(0, this.currentRequests - 1);
                }
            } catch (error: any) {
                const status = error?.response?.status;
                if (status === 429) {
                    const ra = parseInt(error?.response?.headers?.['retry-after'] || '0', 10);
                    const waitMs = isNaN(ra) || ra <= 0 ? 5000 : ra * 1000;
                    this.rateLimitedUntil = Date.now() + waitMs;
                    console.warn(`[PriceFeed] Received 429, backing off for ${waitMs}ms`);

                    const cached = this.priceCache.get(cacheKey);
                    if (cached) {
                        console.log(`[PriceFeed] Using stale cache for ${currency}: $${cached.price}`);
                        return cached.price;
                    }
                    throw new Error(`Unable to fetch price for ${currency} (rate limited)`);
                }

                console.error(`Failed to fetch price for ${currency}:`, error);

                const cached = this.priceCache.get(cacheKey);
                if (cached) {
                    console.log(`[PriceFeed] Using stale cache for ${currency}: $${cached.price}`);
                    return cached.price;
                }

                throw new Error(`Unable to fetch price for ${currency}`);
            }
        })();

        this.inflight.set(cacheKey, p);
        try {
            return await p;
        } finally {
            this.inflight.delete(cacheKey);
        }
    }

    /**
     * Get NGN to USD rate with multiple fallbacks
     */
    private static async getNGNPrice(): Promise<number> {
        const cacheKey = 'NGN';
        
        // Try Method 1: open.er-api.com (free, reliable)
        try {
            const response = await axios.get<{ rates?: { USD?: number } }>(
                'https://open.er-api.com/v6/latest/NGN',
                { timeout: 5000 }
            );
            
            if (response.data?.rates?.USD) {
                const usdPerNgn = Number(response.data.rates.USD);
                if (usdPerNgn > 0 && !isNaN(usdPerNgn)) {
                    this.priceCache.set(cacheKey, { price: usdPerNgn, timestamp: Date.now() });
                    console.log(`[PriceFeed] NGN->USD (open.er-api): $${usdPerNgn}`);
                    return usdPerNgn;
                }
            }
        } catch (error) {
            console.warn('[PriceFeed] open.er-api.com failed for NGN');
        }

        // Try Method 2: exchangerate.host
        try {
            const response = await axios.get<{ result?: number }>(
                'https://api.exchangerate.host/convert?from=NGN&to=USD&amount=1',
                { timeout: 5000 }
            );
            
            if (response.data?.result) {
                const usdPerNgn = Number(response.data.result);
                if (usdPerNgn > 0 && !isNaN(usdPerNgn)) {
                    this.priceCache.set(cacheKey, { price: usdPerNgn, timestamp: Date.now() });
                    console.log(`[PriceFeed] NGN->USD (exchangerate.host): $${usdPerNgn}`);
                    return usdPerNgn;
                }
            }
        } catch (error) {
            console.warn('[PriceFeed] exchangerate.host failed for NGN');
        }

        // Try Method 3: api.exchangerate-api.com (backup)
        try {
            const response = await axios.get<{ conversion_rates?: { USD?: number } }>(
                'https://v6.exchangerate-api.com/v6/latest/NGN',
                { timeout: 5000 }
            );
            
            if (response.data?.conversion_rates?.USD) {
                const usdPerNgn = Number(response.data.conversion_rates.USD);
                if (usdPerNgn > 0 && !isNaN(usdPerNgn)) {
                    this.priceCache.set(cacheKey, { price: usdPerNgn, timestamp: Date.now() });
                    console.log(`[PriceFeed] NGN->USD (exchangerate-api): $${usdPerNgn}`);
                    return usdPerNgn;
                }
            }
        } catch (error) {
            console.warn('[PriceFeed] exchangerate-api.com failed for NGN');
        }

        // Fallback: Use cached value if available (even if old)
        const cached = this.priceCache.get(cacheKey);
        if (cached) {
            console.warn(`[PriceFeed] Using stale cached NGN rate: $${cached.price}`);
            return cached.price;
        }

        // Last resort: Hardcoded approximate rate
        // Update this based on current market rates (as of Oct 2024: ~1,600 NGN = 1 USD)
        const FALLBACK_RATE = 1 / 1600; // 1 NGN = ~0.000625 USD
        this.priceCache.set(cacheKey, { price: FALLBACK_RATE, timestamp: Date.now() });
        console.warn(`[PriceFeed] Using hardcoded fallback NGN rate: $${FALLBACK_RATE}`);
        return FALLBACK_RATE;
    }

    /**
     * Get conversion rate from one currency to another
     */
    static async getConversionRate(
        fromCurrency: string,
        toCurrency: string = 'USDT'
    ): Promise<number> {
        if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
            return 1.0;
        }

        const [fromPrice, toPrice] = await Promise.all([
            this.getPrice(fromCurrency),
            this.getPrice(toCurrency),
        ]);

        return fromPrice / toPrice;
    }

    /**
     * Convert amount from one currency to another
     */
    static async convertAmount(
        amount: number,
        fromCurrency: string,
        toCurrency: string = 'USDT',
        includeSlippage: boolean = true
    ): Promise<{ convertedAmount: number; rate: number; slippage: number }> {
        const rate = await this.getConversionRate(fromCurrency, toCurrency);
        let convertedAmount = amount * rate;

        const slippage = includeSlippage ? 0.005 : 0;
        if (includeSlippage) {
            convertedAmount = convertedAmount * (1 - slippage);
        }

        return {
            convertedAmount,
            rate,
            slippage,
        };
    }

    /**
     * Get all current prices
     */
    static async getAllPrices(): Promise<Record<string, number>> {
        const entries = Object.entries(this.CURRENCY_IDS);
        const prices: Record<string, number> = {};

        const uniqueIds = Array.from(new Set(entries.map(([, id]) => id))).join(',');

        try {
            const response = await axios.get(
                `${this.COINGECKO_API}/simple/price?ids=${uniqueIds}&vs_currencies=usd`,
                { timeout: 15000 }
            );

            const data = response.data as Record<string, { usd?: number }>;

            for (const [currency, coinId] of entries) {
                const price = (data[coinId] && Number(data[coinId].usd)) || 0;
                prices[currency] = price;
                if (price && price > 0) {
                    this.priceCache.set(currency, { price, timestamp: Date.now() });
                }
            }

            return prices;
        } catch (err) {
            console.warn('[PriceFeed] Bulk fetch failed, falling back to individual requests');

            const currencies = Object.keys(this.CURRENCY_IDS);
            await Promise.allSettled(
                currencies.map(async (currency) => {
                    try {
                        const p = await this.getPrice(currency);
                        prices[currency] = p;
                    } catch (error) {
                        console.error(`Failed to get price for ${currency}:`, error);
                        prices[currency] = 0;
                    }
                })
            );

            return prices;
        }
    }

    /**
     * Calculate conversion with fees
     */
    static async calculateConversion(
        amount: number,
        fromCurrency: string,
        toCurrency: string = 'USDT',
        feePercentage: number = 0.003
    ): Promise<{
        inputAmount: number;
        outputAmount: number;
        rate: number;
        fee: number;
        totalFeeUSD: number;
        slippage: number;
    }> {
        const conversion = await this.convertAmount(
            amount,
            fromCurrency,
            toCurrency,
            true
        );

        const fee = conversion.convertedAmount * feePercentage;
        const finalAmount = conversion.convertedAmount - fee;

        const feeInUSD =
            toCurrency === 'USDT'
                ? fee
                : fee * (await this.getConversionRate(toCurrency, 'USDT'));

        return {
            inputAmount: amount,
            outputAmount: finalAmount,
            rate: conversion.rate,
            fee: fee,
            totalFeeUSD: feeInUSD,
            slippage: conversion.slippage,
        };
    }

    /**
     * Clear price cache
     */
    static clearCache(): void {
        this.priceCache.clear();
    }
}