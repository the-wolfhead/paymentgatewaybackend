// src/services/palmpayService.js
import axios from "axios";
import crypto from "crypto";
import { RsaUtil } from "../utils/rsaUtil.js";

const BASE_URL = process.env.PALMPAY_BASE_URL || "https://api.palmpay.com"; // Use sandbox for testing
const MERCHANT_ID = process.env.PALMPAY_MERCHANT_ID;
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;
const PALMPAY_PUBLIC_KEY = process.env.PALMPAY_PUBLIC_KEY;

const buildSignString = (obj) => {
  return Object.keys(obj)
    .sort()
    .map(key => `${key}=${obj[key]}`)
    .join('&');
};

export const palmPayCreateDeposit = async (orderData) => {
  const requestBody = {
    merchantId: MERCHANT_ID,
    orderNo: orderData.orderNo || `PP_${Date.now()}`,   // Unique reference from your system
    amount: orderData.amount,
    currency: orderData.currency || "NGN",
    description: orderData.description || "Deposit",
    notifyUrl: `${process.env.BASE_URL}/api/webhooks/palmpay`, // Your webhook endpoint
    returnUrl: orderData.returnUrl,   // Redirect user after payment
    timestamp: Math.floor(Date.now() / 1000),
    nonce: crypto.randomBytes(16).toString("hex"),
    ...orderData.extra, // e.g. customer info, product details
  };

  const signString = buildSignString(requestBody);
  const signature = RsaUtil.sign(MERCHANT_PRIVATE_KEY, signString);

  const response = await axios.post(`${BASE_URL}/pay-ins/palmpay-checkout/create-order`, requestBody, {
    headers: {
      "Content-Type": "application/json",
      "Sign": signature,
      "Merchant-Id": MERCHANT_ID,
    },
  });

  return response.data;   // Typically returns { orderNo, checkoutUrl, ... }
};
