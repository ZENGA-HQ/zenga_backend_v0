import axios from 'axios';
import { paystackConfig } from './config';

export interface InitPaymentInput {
  customerEmail: string;
  amount: number;
  crypto?: string; 
  paymentReference?: string;
  redirectUrl: string;
  paymentDescription?: string;
}

export interface InitPaymentResponseData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface InitPaymentResponse {
  status: boolean;
  message: string;
  data: InitPaymentResponseData;
}

const initializeTransaction = async (
  data: InitPaymentInput
): Promise<InitPaymentResponse> => {
  if (!data) throw new Error('Customer info is required');

  try {
    const response = await axios.post<InitPaymentResponse>(
      `${paystackConfig.baseUrl}/transaction/initialize`,
      {
        email: data.customerEmail,
        amount: data.amount * 100,
        reference: data.paymentReference,
        callback_url: data.redirectUrl,
        metadata: {
          description: data.paymentDescription,
          custom_fields: [],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${paystackConfig.secretKey}`,
        },
      }
    );

    return response.data; 
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || 'Failed to initialize transaction');
  }
};

export default initializeTransaction;
