// src/services/palmpayService.js
import axios from "axios";
import crypto from "crypto";
import { RsaUtil } from "../utils/rsaUtil.js";

const BASE_URL = process.env.PALMPAY_BASE_URL || "https://api.palmpay.com";
const MERCHANT_ID = process.env.PALMPAY_MERCHANT_ID;
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;

if (!MERCHANT_ID || !MERCHANT_PRIVATE_KEY) {
  console.error("❌ CRITICAL: PalmPay Merchant ID or Private Key is missing in .env");
}

const buildSignString = (obj) => {
  const data = { ...obj };
  delete data.sign;
  return Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('&');
};

export const palmPayCreateDeposit = async (orderData) => {
  const requestId = `PP_REQ_${Date.now()}`;

  try {
    const requestBody = {
      merchantId: MERCHANT_ID,
      orderNo: orderData.orderNo,
      amount: Number(orderData.amount),
      currency: orderData.currency || "NGN",
      description: orderData.description || "Medical Appointment Payment",
      notifyUrl: `${process.env.BASE_URL || 'https://paymentgatewaybackend-580i.onrender.com'}/api/webhooks/palmpay`,
      returnUrl: orderData.returnUrl,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: crypto.randomBytes(16).toString("hex"),
    };

    // Build sign string
    const signString = buildSignString(requestBody);
    const signature = RsaUtil.sign(MERCHANT_PRIVATE_KEY, signString);

    console.log(`\n[${requestId}] === PALMPAY REQUEST ===`);
    console.log("Endpoint:", `${BASE_URL}/pay-ins/palmpay-checkout/create-order`);
    console.log("Merchant ID:", MERCHANT_ID);
    console.log("Order No:", requestBody.orderNo);
    console.log("Amount:", requestBody.amount);
    console.log("Return URL:", requestBody.returnUrl);
    console.log("Sign String:", signString);

    const response = await axios.post(
      `${BASE_URL}/pay-ins/palmpay-checkout/create-order`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "Sign": signature,
          "Merchant-Id": MERCHANT_ID,
        },
        timeout: 20000,
      }
    );

    console.log(`[${requestId}] ✅ PalmPay Response Success:`);
    console.log(JSON.stringify(response.data, null, 2));

    return response.data;

  } catch (error) {
    console.error(`\n[${requestId}] ❌ PALMPAY ERROR OCCURRED`);

    if (error.response) {
      console.error("Status Code:", error.response.status);
      console.error("Response Body:", JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error("No response received from PalmPay (Timeout or Network Issue)");
    } else {
      console.error("Request Setup Error:", error.message);
    }

    throw error;
  }
};
