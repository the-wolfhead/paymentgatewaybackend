// src/services/palmpayService.js
import axios from "axios";
import crypto from "crypto";
import { RsaUtil } from "../utils/rsaUtil.js";
const BASE_URL = process.env.PALMPAY_BASE_URL || "https://open-gw-daily.palmpay-inc.com";
const MERCHANT_ID = process.env.PALMPAY_MERCHANT_ID;
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;
const AUTH_TOKEN = process.env.PALMPAY_AUTH_TOKEN; // Bearer token from PalmPay
export const palmPayCreateDeposit = async (orderData) => {
  const requestId = `PP_REQ_${Date.now()}`;
  try {
    const requestTime = Date.now();
    const nonceStr = crypto.randomBytes(16).toString("hex");
    const requestBody = {
      requestTime,
      version: "V1.1",
      nonceStr,
      amount: Number(orderData.amount),
      notifyUrl: `${process.env.BASE_URL}/api/webhooks/palmpay`,
      orderId: orderData.orderNo,
      title: "Appointment Payment",
      description: orderData.description || "Medical Appointment Payment",
      currency: "NGN",
      callBackUrl: orderData.returnUrl || "https://paymentgatewaybackend-580i.onrender.com/api/payment/success",
      goodsDetails: '[{"goodsId": "1"}]',
      customerInfo: JSON.stringify({
        userId: "user123",
        userName: "Customer",
        phone: "08000000000",
      }),
      remark: "Appointment Booking",
    };
    // Build sign string (important: follow exact order if specified by PalmPay)
    const signString = Object.keys(requestBody)
      .sort()
      .map(key => `${key}=${requestBody[key]}`)
      .join('&');
    const signature = RsaUtil.sign(MERCHANT_PRIVATE_KEY, signString);
    console.log([`${requestId}`] Sending to PalmPay...);
    console.log("Order ID:", requestBody.orderId);
    console.log("Amount:", requestBody.amount);
    const response = await axios.post(
      `${BASE_URL}/api/v2/payment/merchant/createorder`,
      requestBody,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'CountryCode': 'NG',
          'Authorization': Bearer ${AUTH_TOKEN},
          'Signature': signature,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    console.log([`${requestId}`] PalmPay Response:, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error([`${requestId}`] PalmPay Error:, error.response?.data || error.message);
    throw error;
  }
};
