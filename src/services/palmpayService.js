// src/services/palmpayService.js
import axios from "axios";
import crypto from "crypto";
import { RsaUtil } from "../utils/rsaUtil.js";

const BASE_URL = process.env.PALMPAY_BASE_URL || "https://api.palmpay.com";
const MERCHANT_ID = process.env.PALMPAY_MERCHANT_ID;
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;
const PALMPAY_PUBLIC_KEY = process.env.PALMPAY_PUBLIC_KEY;

if (!MERCHANT_ID || !MERCHANT_PRIVATE_KEY) {
  console.warn("⚠️  PalmPay configuration is incomplete. Check your .env file.");
}

const buildSignString = (obj) => {
  const data = { ...obj };
  delete data.sign;
  return Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('&');
};

const palmPayAxios = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Create a new deposit/order on PalmPay
 */
export const palmPayCreateDeposit = async (orderData) => {
  const requestId = `PP_REQ_${Date.now()}`;

  try {
    if (!orderData.amount || !orderData.orderNo) {
      throw new Error("amount and orderNo are required");
    }

    const requestBody = {
      merchantId: MERCHANT_ID,
      orderNo: orderData.orderNo,
      amount: Number(orderData.amount),
      currency: orderData.currency || "NGN",
      description: orderData.description || "Payment",
      notifyUrl: orderData.notifyUrl || `${process.env.BASE_URL}/api/webhooks/palmpay`,
      returnUrl: orderData.returnUrl,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: crypto.randomBytes(16).toString("hex"),
      ...orderData.extra,
    };

    // Generate signature
    const signString = buildSignString(requestBody);
    const signature = RsaUtil.sign(MERCHANT_PRIVATE_KEY, signString);

    console.log(`[${requestId}] Initiating PalmPay payment for order: ${orderData.orderNo}`);

    const response = await palmPayAxios.post('/pay-ins/palmpay-checkout/create-order', requestBody, {
      headers: {
        "Sign": signature,
        "Merchant-Id": MERCHANT_ID,
      }
    });

    const result = response.data;

    if (result.code !== 0 && result.status !== "SUCCESS") {   // Adjust based on actual PalmPay response format
      throw new Error(result.message || result.msg || "PalmPay returned failure status");
    }

    console.log(`[${requestId}] PalmPay order created successfully`);
    return result;

  } catch (error) {
    console.error(`[${requestId}] PalmPay Create Deposit Error:`);

    if (error.response) {
      // PalmPay returned an error response
      const palmError = error.response.data;
      console.error("PalmPay Error Response:", palmError);

      throw {
        status: error.response.status,
        message: palmError.message || palmError.msg || "Payment gateway rejected the request",
        code: palmError.code,
        data: palmError,
        requestId,
      };
    } else if (error.request) {
      // No response received from PalmPay (timeout, network issue)
      console.error("No response received from PalmPay");
      throw {
        message: "Payment gateway timeout. Please check your network and try again.",
        requestId,
        isNetworkError: true,
      };
    } else {
      // Something else went wrong (e.g., invalid key, signing error)
      console.error("Request setup error:", error.message);
      throw {
        message: error.message || "Failed to process payment request",
        requestId,
      };
    }
  }
};

/**
 * Query transaction status from PalmPay
 */
export const palmPayQueryTransaction = async (orderNo) => {
  const requestId = `PP_QUERY_${Date.now()}`;

  try {
    const requestBody = {
      merchantId: MERCHANT_ID,
      orderNo,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: crypto.randomBytes(16).toString("hex"),
    };

    const signString = buildSignString(requestBody);
    const signature = RsaUtil.sign(MERCHANT_PRIVATE_KEY, signString);

    const response = await palmPayAxios.post('/pay-ins/query', requestBody, {
      headers: { "Sign": signature, "Merchant-Id": MERCHANT_ID }
    });

    return response.data;

  } catch (error) {
    console.error(`[${requestId}] PalmPay Query Error:`, error.message);
    throw error;
  }
};

// You can add more methods later (refund, payout, etc.)
