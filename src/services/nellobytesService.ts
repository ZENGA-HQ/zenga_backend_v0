// src/services/nellobytesService.ts - FIXED
import axios from "axios";

const BASE_URL = "https://www.nellobytesystems.com";

// Get environment variables with fallbacks
function getEnv(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}

// Support both legacy and new environment variable names
const USERID = process.env.CLUB_KONNECT_ID || "CK101265516";
const APIKEY =
  process.env.CLUB_KONNECT_APIKEY || process.env.NELLOBYTES_APIKEY || "";
const CALLBACK =
  process.env.NELLOBYTES_CALLBACK_URL ||
  process.env.CLUB_KONNECT_CALLBACK_URL ||
  "";

// Map our network names to Nellobytes API codes
export enum MobileNetworkCode {
  MTN = "01",
  GLO = "02",
  ETISALAT = "03",
  AIRTEL = "04",
}

interface NellobytesMobileNetworkResponse {
  MOBILE_NETWORK: {
    [network: string]: Array<{
      ID: string;
      PRODUCT: Array<{
        PRODUCT_SNO: string;
        PRODUCT_CODE: string;
        PRODUCT_ID: string;
        PRODUCT_NAME: string;
        PRODUCT_AMOUNT: string;
      }>;
    }>;
  };
}

interface NellobytesElectricCompanyResponse {
  ELECTRIC_COMPANY: {
    [company: string]: Array<{
      ID: string;
      NAME: string;
      PRODUCT: Array<{
        PRODUCT_ID: string;
        PRODUCT_TYPE: string;
        MINIMUN_AMOUNT: string;
        MAXIMUM_AMOUNT: string;
        PRODUCT_DISCOUNT_AMOUNT: string;
        PRODUCT_DISCOUNT: string;
        MINAMOUNT: number;
        MAXAMOUNT: number;
      }>;
    }>;
  };
}

// Response structure from Nellobytes API
export interface NellobytesResponse {
  orderid?: string;
  statuscode?: string;
  status?: string;
  requestid?: string;
  transid?: string;
  meterno?: string;
  metertoken?: string;
  customer_name?: string;
}

// Data plan structure from Nellobytes API
export interface NellobytesDataPlan {
  dataplan_id: string;
  plan_network: string;
  plan_name: string;
  plan_amount: string;
  month_validate: string;
}

// Electricity company structure from Nellobytes API
export interface NellobytesElectricCompany {
  company_id: string; // e.g., "01", "02"
  company_name: string; // e.g., "Eko Electric - EKEDC (PHCN)"
  prepaid_available: boolean;
  postpaid_available: boolean;
  min_amount: number;
  max_amount: number;
}

// Data needed for airtime purchase
export interface AirtimePurchaseParams {
  mobileNetwork: MobileNetworkCode;
  amount: number;
  mobileNumber: string;
  requestId?: string;
  bonusType?: string;
}

// Data needed for data bundle purchase
export interface DataBundlePurchaseParams {
  mobileNetwork: MobileNetworkCode;
  dataPlan: string; // This is the dataplan_id from the API
  mobileNumber: string;
  requestId?: string;
}

// Data needed for electricity purchase
export interface ElectricityPurchaseParams {
  electricCompany: string; // Company code (01-12)
  meterType: string; // Meter type code (01=prepaid, 02=postpaid)
  meterNo: string;
  phoneNo: string;
  amount: number;
  CallBackURL?: string;
}

/**
 * Build URL query string from parameters
 */
function buildQuery(params: Record<string, any>): string {
  const esc = encodeURIComponent;
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .map((key) => `${esc(key)}=${esc(params[key])}`)
    .join("&");
}

async function callApi(
  path: string,
  params: Record<string, any>
): Promise<NellobytesResponse> {
  // Validate credentials
  if (!USERID || !APIKEY) {
    throw new Error(
      "Nellobytes credentials are not set. " +
        "Please set NELLOBYTES_USERID/NELLOBYTES_APIKEY or CLUB_KONNECT_ID/CLUB_KONNECT_APIKEY in your environment"
    );
  }

  // Add required parameters
  const fullParams: Record<string, any> = {
    UserID: USERID,
    APIKey: APIKEY,
    ...params,
  };

  // Add callback URL if provided and not empty
  if (CALLBACK && CALLBACK.trim() !== "") {
    fullParams.CallBackURL = CALLBACK;
  }

  // For Nellobytes, build the URL with parameters directly in the path
  const queryString = buildQuery(fullParams);

  const url = `${BASE_URL}/${path}?${queryString}`;

  try {
    console.log(`📞 Calling Nellobytes API: ${path}`);
    console.log(`📋 Parameters:`, { ...fullParams, APIKey: "***" });
    console.log(`🔗 Full URL: ${url.replace(APIKEY, "***")}`);

    const response = await axios.get(url, { timeout: 15000 });

    console.log(`✅ Nellobytes raw response:`, response.data);
    console.log(
      `🔐 Using Credentials - UserID: ${USERID}, APIKey: ${
        APIKEY ? "***" + APIKEY.slice(-4) : "MISSING"
      }`
    );

    return parseNellobytesResponse(response.data);
  } catch (error: any) {
    console.error(`❌ Nellobytes API error (${path}):`, error.message);

    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);

      try {
        const errorResponse = parseNellobytesResponse(error.response.data);
        return errorResponse;
      } catch (parseError) {
        throw new Error(
          `Nellobytes API error: ${error.response.status} - ${error.response.statusText}`
        );
      }
    } else if (error.request) {
      throw new Error(
        "No response from Nellobytes API - check your internet connection"
      );
    } else {
      throw new Error(`Nellobytes API call failed: ${error.message}`);
    }
  }
}

/**
 * Parse Nellobytes API response which can be in different formats
 */
function parseNellobytesResponse(data: any): NellobytesResponse {
  if (typeof data === "string") {
    const params = new URLSearchParams(data);
    return {
      orderid: params.get("orderid") || undefined,
      statuscode: params.get("statuscode") || undefined,
      status: params.get("status") || undefined,
      requestid: params.get("requestid") || undefined,
      transid: params.get("transid") || undefined,
      meterno: params.get("meterno") || undefined,
      metertoken: params.get("metertoken") || undefined,
      // ADD CUSTOMER NAME FIELD
      customer_name:
        params.get("customer_name") || params.get("name") || undefined,
    };
  }

  if (typeof data === "object" && data !== null) {
    const status = data.status || data.Status || undefined;
    const statuscode =
      data.statuscode?.toString() ||
      data.StatusCode?.toString() ||
      (status === "00" ? "00" : undefined);

    return {
      orderid: data.orderid || data.OrderID,
      statuscode,
      status,
      requestid: data.requestid || data.RequestID,
      transid: data.transid || data.TransID,
      meterno: data.meterno || data.MeterNo,
      metertoken: data.metertoken || data.MeterToken,
      // ADD CUSTOMER NAME FIELD - check multiple possible field names
      customer_name:
        data.customer_name ||
        data.name ||
        data.CustomerName ||
        data.customerName ||
        undefined,
    };
  }

  throw new Error(`Unexpected response format from Nellobytes`);
}

/**
 * Convert our network name to Nellobytes code
 */
export function convertNetworkToCode(network: string): MobileNetworkCode {
  const codeMap: { [key: string]: MobileNetworkCode } = {
    mtn: MobileNetworkCode.MTN,
    glo: MobileNetworkCode.GLO,
    airtel: MobileNetworkCode.AIRTEL,
    etisalat: MobileNetworkCode.ETISALAT,
    "9mobile": MobileNetworkCode.ETISALAT, // Alias for etisalat
  };

  const code = codeMap[network.toLowerCase()];
  if (!code) {
    throw new Error(
      `Unsupported mobile network: ${network}. Supported: mtn, glo, airtel, etisalat, 9mobile`
    );
  }

  return code;
}

/**
 * Check if a Nellobytes response indicates success
 */
export function isSuccessfulResponse(response: NellobytesResponse): boolean {
  const successStatusCodes = ["00", "100", "200", "201"];
  const successStatusMessages = [
    "ORDER_RECEIVED",
    "ORDER_COMPLETED",
    "SUCCESS",
    "COMPLETED",
  ];

  // Check if status code indicates success
  if (response.statuscode && successStatusCodes.includes(response.statuscode)) {
    return true;
  }

  // Check if status message indicates success
  if (response.status && successStatusMessages.includes(response.status)) {
    return true;
  }

  // For electricity purchases, status "00" usually means success
  if (response.status === "00" || response.statuscode === "00") {
    return true;
  }

  return false;
}

/**
 * Map Nellobytes status codes to user-friendly messages
 */
export function getStatusMessage(response: NellobytesResponse): string {
  const statusMessages: { [key: string]: string } = {
    "100": "Transaction successful",
    "200": "Transaction successful",
    ORDER_RECEIVED: "Order received and processing",
    INVALID_CREDENTIALS: "Invalid API credentials",
    MISSING_CREDENTIALS: "API credentials missing",
    INVALID_AMOUNT: "Invalid amount specified",
    MINIMUM_50: "Minimum amount is 50 NGN",
    MINIMUM_200000: "Maximum amount is 200,000 NGN",
    INVALID_RECIPIENT: "Invalid phone number",
    INVALID_PRODUCT_CODE: "Invalid data plan selected",
    SERVICE_TEMPORARILY_UNAVAIALBLE: "Service temporarily unavailable",
    INSUFFICIENT_APIBALANCE: "Insufficient provider balance",
    INVALID_NETWORK: "Invalid network selected",
    TRANSACTION_FAILED: "Transaction failed",
  };

  return (
    statusMessages[response.status ?? ""] ||
    statusMessages[response.statuscode ?? ""] ||
    `Transaction status: ${response.status ?? "unknown"}`
  );
}

/**
 * Parse price string from Nellobytes (e.g., "N2,325.00" to 2325.00)
 */
export function parsePriceString(priceStr: string): number {
  // Remove currency symbol, commas, and parse as float
  const cleaned = priceStr.replace(/[N₦,\s]/g, "");
  const price = parseFloat(cleaned);

  if (isNaN(price)) {
    throw new Error(`Invalid price format: ${priceStr}`);
  }

  return price;
}

export class NellobytesService {
  /**
   * Buy airtime
   * @param params - Airtime purchase parameters
   * @returns Nellobytes API response
   */
  async buyAirtime(params: AirtimePurchaseParams): Promise<NellobytesResponse> {
    console.log("💰 Purchasing airtime:", {
      network: params.mobileNetwork,
      amount: params.amount,
      phone: params.mobileNumber,
    });

    const nellobytesParams = {
      MobileNetwork: params.mobileNetwork,
      Amount: params.amount.toString(),
      MobileNumber: params.mobileNumber,
      ...(params.requestId && { RequestID: params.requestId }),
      ...(params.bonusType && { BonusType: params.bonusType }),
    };

    const response = await callApi("APIAirtimeV1.asp", nellobytesParams);

    console.log("📱 Airtime purchase response:", {
      orderid: response.orderid,
      status: response.status,
      statuscode: response.statuscode,
    });

    return response;
  }

  /**
   * Buy data bundle
   * @param params - Data bundle purchase parameters
   * @returns Nellobytes API response
   */
  async buyDatabundle(
    params: DataBundlePurchaseParams
  ): Promise<NellobytesResponse> {
    console.log("📊 Purchasing data bundle:", {
      network: params.mobileNetwork,
      dataPlan: params.dataPlan,
      phone: params.mobileNumber,
    });

    const nellobytesParams = {
      MobileNetwork: params.mobileNetwork,
      DataPlan: params.dataPlan,
      MobileNumber: params.mobileNumber,
      ...(params.requestId && { RequestID: params.requestId }),
    };

    const response = await callApi("APIDatabundleV1.asp", nellobytesParams);

    console.log("📊 Data bundle purchase response:", {
      orderid: response.orderid,
      status: response.status,
      statuscode: response.statuscode,
    });

    return response;
  }

  /**
   * Buy electricity - FIXED VERSION
   * @param params - Electricity purchase parameters
   * @returns Nellobytes API response
   */
  async buyElectricity(
    params: ElectricityPurchaseParams
  ): Promise<NellobytesResponse> {
    console.log("⚡ Purchasing electricity:", {
      company: params.electricCompany,
      meterType: params.meterType,
      meterNo: params.meterNo,
      phoneNo: params.phoneNo,
      amount: params.amount,
    });

    // Build parameters in the EXACT order and format that Nellobytes expects
    const nellobytesParams: Record<string, any> = {
      ElectricCompany: params.electricCompany,
      MeterType: params.meterType,
      MeterNo: params.meterNo,
      Amount: params.amount.toString(),
      PhoneNo: params.phoneNo,
      // ADD REQUIRED REQUESTID PARAMETER:
      RequestID: `VELO_ELECTRICITY_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`,
    };

    // Add callback URL if provided
    if (CALLBACK && CALLBACK.trim() !== "") {
      nellobytesParams.CallBackURL = CALLBACK;
    }

    const response = await callApi("APIElectricityV1.asp", nellobytesParams);

    console.log("⚡ Electricity purchase response:", {
      orderid: response.orderid,
      status: response.status,
      statuscode: response.statuscode,
      meterno: response.meterno,
      metertoken: response.metertoken,
    });

    return response;
  }

  /**
   * Verify electricity meter number
   * @param electricCompany - Company code (01-12)
   * @param meterNo - Meter number to verify
   * @returns Nellobytes API response
   */
  async verifyElectricityMeter(
    electricCompany: string,
    meterNo: string
  ): Promise<NellobytesResponse> {
    console.log(" Verifying meter:", { company: electricCompany, meterNo });

    const nellobytesParams = {
      ElectricCompany: electricCompany,
      MeterNo: meterNo,
    };

    const response = await callApi(
      "APIVerifyElectricityV1.asp",
      nellobytesParams
    );

    console.log(" Meter verification response:", {
      status: response.status,
      statuscode: response.statuscode,
      meterno: response.meterno,
    });

    return response;
  }

  /**
   * Fetch electricity companies and their details from Nellobytes API
   * @returns Array of electricity companies
   */
  async fetchElectricityCompanies(): Promise<NellobytesElectricCompany[]> {
    console.log("⚡ Fetching electricity companies from Nellobytes API...");

    try {
      const url = `${BASE_URL}/APIElectricityDiscosV1.asp?UserID=${USERID}`;

      console.log(`📞 Calling: ${url}`);

      const response = await axios.get<NellobytesElectricCompanyResponse>(url, {
        timeout: 30000,
      });

      console.log(
        "⚡ Raw electricity companies response type:",
        typeof response.data
      );

      // Parse response based on format
      let companies: NellobytesElectricCompany[] = [];

      if (Array.isArray(response.data)) {
        companies = response.data;
      } else if (typeof response.data === "object" && response.data !== null) {
        const data = response.data as any;

        if (data.companies) {
          companies = data.companies;
        } else if (data.data) {
          companies = data.data;
        } else if (data.ELECTRIC_COMPANY) {
          // Handle the nested structure from the API
          companies = this.parseElectricCompanyData(data.ELECTRIC_COMPANY);
        } else {
          companies = Object.values(data).filter(
            (item: any) => item && typeof item === "object" && item.company_id
          ) as NellobytesElectricCompany[];
        }
      }

      console.log(
        `✅ Fetched ${companies.length} electricity companies from API`
      );

      return companies;
    } catch (error: any) {
      console.error("❌ Failed to fetch electricity companies:", error.message);

      if (error.response) {
        console.error("Response data:", error.response.data);
      }

      throw new Error(
        `Failed to fetch electricity companies from Nellobytes: ${error.message}`
      );
    }
  }

  /**
   * Parse the complex ELECTRIC_COMPANY structure from Nellobytes API
   */
  private parseElectricCompanyData(
    electricCompanyData: any
  ): NellobytesElectricCompany[] {
    const companies: NellobytesElectricCompany[] = [];

    try {
      // Iterate through each company (EKO_ELECTRIC, IKEJA_ELECTRIC, etc.)
      Object.keys(electricCompanyData).forEach((companyKey) => {
        const companyArray = electricCompanyData[companyKey];

        if (Array.isArray(companyArray)) {
          companyArray.forEach((companyItem) => {
            if (companyItem.PRODUCT && Array.isArray(companyItem.PRODUCT)) {
              // Check what products are available
              let prepaidAvailable = false;
              let postpaidAvailable = false;
              let minAmount = 1000;
              let maxAmount = 200000;

              companyItem.PRODUCT.forEach((product: any) => {
                if (product.PRODUCT_TYPE === "prepaid") {
                  prepaidAvailable = true;
                }
                if (product.PRODUCT_TYPE === "postpaid") {
                  postpaidAvailable = true;
                }
                // Get min/max amounts
                if (product.MINAMOUNT) {
                  minAmount = Math.max(minAmount, parseInt(product.MINAMOUNT));
                }
                if (product.MAXAMOUNT) {
                  maxAmount = parseInt(product.MAXAMOUNT);
                }
              });

              const company: NellobytesElectricCompany = {
                company_id: companyItem.ID,
                company_name: companyItem.NAME,
                prepaid_available: prepaidAvailable,
                postpaid_available: postpaidAvailable,
                min_amount: minAmount,
                max_amount: maxAmount,
              };

              companies.push(company);
            }
          });
        }
      });

      console.log(
        `⚡ Parsed ${companies.length} companies from ELECTRIC_COMPANY structure`
      );
    } catch (error) {
      console.error("❌ Error parsing ELECTRIC_COMPANY data:", error);
    }

    return companies;
  }

  /**
   * Fetch available data plans from Nellobytes API
   * @param network - Network code or name
   * @returns Array of data plans
   */
  async fetchDataPlans(network?: string): Promise<NellobytesDataPlan[]> {
    console.log("📋 Fetching data plans from Nellobytes API...");

    try {
      // Build URL - if network is provided, filter by network
      const url = network
        ? `${BASE_URL}/APIDatabundlePlansV2.asp?UserID=${USERID}`
        : `${BASE_URL}/APIDatabundlePlansV2.asp?UserID=${USERID}`;

      console.log(`📞 Calling: ${url}`);

      const response = await axios.get<NellobytesMobileNetworkResponse>(url, {
        timeout: 30000,
      });

      console.log("📋 Raw data plans response type:", typeof response.data);

      // Parse response based on format
      let plans: NellobytesDataPlan[] = [];

      if (Array.isArray(response.data)) {
        // Response is already an array of plans
        plans = response.data;
      } else if (typeof response.data === "object" && response.data !== null) {
        // Response might be an object with plans nested
        const data = response.data as any; // Type assertion to avoid TypeScript errors

        if (data.plans) {
          plans = data.plans;
        } else if (data.data) {
          plans = data.data;
        } else if (data.MOBILE_NETWORK) {
          // Handle the nested structure from your example response
          plans = this.parseMobileNetworkData(data.MOBILE_NETWORK);
        } else {
          // Try to extract plans from object values
          plans = Object.values(data).filter(
            (item: any) => item && typeof item === "object" && item.dataplan_id
          ) as NellobytesDataPlan[];
        }
      }

      console.log(`✅ Fetched ${plans.length} data plans from API`);

      // Filter by network if specified
      if (network) {
        const networkCode =
          typeof network === "string" && network.length <= 2
            ? network
            : convertNetworkToCode(network);

        plans = plans.filter((plan) => plan.plan_network === networkCode);
        console.log(
          `📋 Filtered to ${plans.length} plans for network ${networkCode}`
        );
      }

      return plans;
    } catch (error: any) {
      console.error("❌ Failed to fetch data plans:", error.message);

      if (error.response) {
        console.error("Response data:", error.response.data);
      }

      throw new Error(
        `Failed to fetch data plans from Nellobytes: ${error.message}`
      );
    }
  }

  /**
   * Parse the complex MOBILE_NETWORK structure from Nellobytes API
   */
  private parseMobileNetworkData(mobileNetworkData: any): NellobytesDataPlan[] {
    const plans: NellobytesDataPlan[] = [];

    try {
      // Iterate through each network (MTN, GLO, etc.)
      Object.keys(mobileNetworkData).forEach((networkKey) => {
        const networkArray = mobileNetworkData[networkKey];

        if (Array.isArray(networkArray)) {
          networkArray.forEach((networkItem) => {
            if (networkItem.PRODUCT && Array.isArray(networkItem.PRODUCT)) {
              // Convert each PRODUCT to NellobytesDataPlan format
              networkItem.PRODUCT.forEach((product: any) => {
                const plan: NellobytesDataPlan = {
                  dataplan_id: product.PRODUCT_ID,
                  plan_network: networkItem.ID,
                  plan_name: product.PRODUCT_NAME,
                  plan_amount: product.PRODUCT_AMOUNT,
                  month_validate: this.extractValidityPeriod(
                    product.PRODUCT_NAME
                  ),
                };
                plans.push(plan);
              });
            }
          });
        }
      });

      console.log(
        `📋 Parsed ${plans.length} plans from MOBILE_NETWORK structure`
      );
    } catch (error) {
      console.error("❌ Error parsing MOBILE_NETWORK data:", error);
    }

    return plans;
  }

  /**
   * Extract validity period from product name
   */
  private extractValidityPeriod(productName: string): string {
    // Try to extract validity period like "30 days", "7 days", etc.
    const match = productName.match(/(\d+)\s*(day|month|week)s?/i);
    if (match) {
      return `${match[1]} ${match[2].toLowerCase()}${
        match[1] === "1" ? "" : "s"
      }`;
    }
    return "Unknown";
  }

  /**
   * Query transaction status by RequestID or OrderID
   */
  async queryStatus(
    requestId?: string,
    orderId?: string
  ): Promise<NellobytesResponse> {
    if (!requestId && !orderId) {
      throw new Error("Either requestId or orderId must be provided");
    }

    console.log(" Querying transaction status:", { requestId, orderId });

    const params: any = {};
    if (requestId) params.RequestID = requestId;
    if (orderId) params.OrderID = orderId;

    const response = await callApi("APIQueryV1.asp", params);

    console.log(" Query status response:", {
      orderid: response.orderid,
      status: response.status,
      statuscode: response.statuscode,
    });

    return response;
  }

  /**
   * Cancel transaction by RequestID
   */
  async cancelTransaction(requestId: string): Promise<NellobytesResponse> {
    console.log("🚫 Cancelling transaction:", requestId);

    const response = await callApi("APICancelV1.asp", { RequestID: requestId });

    console.log("🚫 Cancel transaction response:", {
      status: response.status,
      statuscode: response.statuscode,
    });

    return response;
  }

  /**
   * Utility function to purchase airtime using network name instead of code
   */
  async purchaseAirtimeSimple(
    network: string,
    amount: number,
    phoneNumber: string,
    requestId?: string
  ): Promise<NellobytesResponse> {
    console.log("💰 Simple airtime purchase:", {
      network,
      amount,
      phoneNumber,
    });

    const networkCode = convertNetworkToCode(network);

    return this.buyAirtime({
      mobileNetwork: networkCode,
      amount,
      mobileNumber: phoneNumber,
      requestId,
    });
  }

  /**
   * Utility function to purchase data bundle using network name and dataplan_id
   */
  async purchaseDataBundle(
    network: string,
    dataplanId: string,
    phoneNumber: string,
    requestId?: string
  ): Promise<NellobytesResponse> {
    console.log("📊 Simple data bundle purchase:", {
      network,
      dataplanId,
      phoneNumber,
    });

    const networkCode = convertNetworkToCode(network);

    return this.buyDatabundle({
      mobileNetwork: networkCode,
      dataPlan: dataplanId,
      mobileNumber: phoneNumber,
      requestId,
    });
  }

  /**
   * Utility function to purchase electricity - FIXED VERSION
   */
  async purchaseElectricity(
    electricCompany: string,
    meterType: string,
    meterNo: string,
    phoneNo: string,
    amount: number,
    requestId?: string // Keep this for your internal tracking, but don't send to Nellobytes
  ): Promise<NellobytesResponse> {
    console.log("⚡ Simple electricity purchase:", {
      electricCompany,
      meterType,
      meterNo,
      phoneNo,
      amount,
    });

    // Don't include requestId in the parameters sent to Nellobytes
    // The RequestID will be generated automatically in buyElectricity method
    return this.buyElectricity({
      electricCompany,
      meterType,
      meterNo,
      phoneNo,
      amount,
    });
  }

  /**
   * Check API balance (if supported by Nellobytes)
   */
  async checkBalance(): Promise<any> {
    console.log("💳 Checking Nellobytes API balance");

    try {
      // Note: Balance endpoint may vary, adjust as needed
      const response = await callApi("APIBalanceV1.asp", {});
      console.log("💳 Balance response:", response);
      return response;
    } catch (error: any) {
      console.error("❌ Balance check failed:", error.message);
      throw error;
    }
  }

  // Export helper functions
  helpers = {
    convertNetworkToCode,
    isSuccessfulResponse,
    parseNellobytesResponse,
    getStatusMessage,
    parsePriceString,
  };
}

// Export singleton instance
const nellobytesService = new NellobytesService();
export default nellobytesService;

// Also export the class for testing purposes
export { NellobytesService as NellobytesServiceClass };

// Export helper functions at module level for backward compatibility
export {
  convertNetworkToCode as convertNetworkToCodeHelper,
  isSuccessfulResponse as isSuccessfulResponseHelper,
  parseNellobytesResponse as parseNellobytesResponseHelper,
  getStatusMessage as getStatusMessageHelper,
  parsePriceString as parsePriceStringHelper,
};
