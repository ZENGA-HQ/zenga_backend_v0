/**
 * VELO Treasury Configuration
 * 
 * Fee collection wallet addresses for each blockchain network
 * Fees are sent to these addresses after successful transactions
 */

export interface TreasuryWallet {
    address: string;
    chain: string;
    network: string;
    description: string;
}

export class TreasuryConfig {
    // Get treasury wallet address for a specific chain and network
    static getTreasuryWallet(chain: string, network: string): string {
        // Try a few environment key patterns to be tolerant of different .env naming
        const key1 = `${chain.toUpperCase()}_${network.toUpperCase()}_TREASURY`; // e.g. SOLANA_TESTNET_TREASURY
        const key2 = `VELO_TREASURY_${(chain === 'solana' ? 'SOL' : chain.toUpperCase())}_${network.toUpperCase()}`; // e.g. VELO_TREASURY_SOL_TESTNET

        const envAddress1 = (process.env[key1] || '').trim();
        const envAddress2 = (process.env[key2] || '').trim();

        if (envAddress1) return envAddress1;
        if (envAddress2) return envAddress2;

        // Fallback to default treasury addresses (REPLACE THESE WITH YOUR ACTUAL ADDRESSES)
        const defaultWallets: Record<string, string> = {
            // Ethereum
            'ethereum_mainnet': process.env.VELO_TREASURY_ETH_MAINNET || '',
            'ethereum_sepolia': process.env.VELO_TREASURY_ETH_SEPOLIA || '',
            
            // Bitcoin
            'bitcoin_mainnet': process.env.VELO_TREASURY_BTC_MAINNET || '',
            'bitcoin_testnet': process.env.VELO_TREASURY_BTC_TESTNET || '',
            
            // Starknet
            'starknet_mainnet': process.env.VELO_TREASURY_STRK_MAINNET || '',
            'starknet_testnet': process.env.VELO_TREASURY_STRK_TESTNET || '',
            
            // Solana
            'solana_mainnet': process.env.VELO_TREASURY_SOL_MAINNET || '',
            'solana_testnet': process.env.VELO_TREASURY_SOL_TESTNET || '',
            
            // Stellar
            'stellar_mainnet': process.env.VELO_TREASURY_XLM_MAINNET || '',
            'stellar_testnet': process.env.VELO_TREASURY_XLM_TESTNET || '',
            
            // Polkadot
            'polkadot_mainnet': process.env.VELO_TREASURY_DOT_MAINNET || '',
            'polkadot_testnet': process.env.VELO_TREASURY_DOT_TESTNET || '',
        };

        const lookupKey = `${chain.toLowerCase()}_${network.toLowerCase()}`;
        const address = defaultWallets[lookupKey];

        if (!address) {
            throw new Error(
                `No treasury wallet configured for ${chain}/${network}. ` +
                `Please set ${key2} or ${key1} environment variable.`
            );
        }

        return address;
    }

    // Validate if treasury wallet is configured
    static isTreasuryConfigured(chain: string, network: string): boolean {
        try {
            const address = this.getTreasuryWallet(chain, network);
            return !!address && address.length > 0;
        } catch {
            return false;
        }
    }

    // Get all configured treasury wallets
    static getAllTreasuryWallets(): TreasuryWallet[] {
        const wallets: TreasuryWallet[] = [];
        const chains = [
            { chain: 'ethereum', networks: ['mainnet', 'sepolia'] },
            { chain: 'bitcoin', networks: ['mainnet', 'testnet'] },
            { chain: 'starknet', networks: ['mainnet', 'testnet'] },
            { chain: 'solana', networks: ['mainnet', 'testnet'] },
            { chain: 'stellar', networks: ['mainnet', 'testnet'] },
            { chain: 'polkadot', networks: ['mainnet', 'testnet'] }
        ];

        chains.forEach(({ chain, networks }) => {
            networks.forEach(network => {
                try {
                    const address = this.getTreasuryWallet(chain, network);
                    if (address) {
                        wallets.push({
                            address,
                            chain,
                            network,
                            description: `VELO ${chain} ${network} treasury`
                        });
                    }
                } catch {
                    // Skip unconfigured wallets
                }
            });
        });

        return wallets;
    }

    // Validate treasury wallet address format (basic check)
    static validateTreasuryAddress(address: string, chain: string): boolean {
        if (!address || address.length === 0) return false;

        switch (chain.toLowerCase()) {
            case 'ethereum':
            case 'starknet':
                return /^0x[a-fA-F0-9]{40,64}$/.test(address);
            
            case 'bitcoin':
                return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(address);
            
            case 'solana':
                return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
            
            case 'stellar':
                return /^G[A-Z2-7]{55}$/.test(address);
            
            case 'polkadot':
                return /^1[0-9a-zA-Z]{47}$/.test(address);
            
            default:
                return true; // Unknown chain, skip validation
        }
    }
}

export default TreasuryConfig;
