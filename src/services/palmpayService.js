// src/services/palmpayService.js
import axios from "axios";
import crypto from "crypto";
import { RsaUtil } from "../utils/rsaUtil.js";

const BASE_URL =
  process.env.PALMPAY_BASE_URL || "https://open-gw-sandbox.palmpay-inc.com";
const MERCHANT_ID = process.env.PALMPAY_AUTH_TOKEN;
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;

function buildSignString(params) {
  return Object.keys(params)
    .filter((key) => {
      const val = params[key];
      return val !== undefined && val !== null && String(val).trim() !== "";
    })
    .sort()
    .map((key) => `${key}=${String(params[key]).trim()}`)
    .join("&");
}

function generateSignature(body) {
  const strA = buildSignString(body);
  const md5Str = crypto
    .createHash("md5")
    .update(strA, "utf8")
    .digest("hex")
    .toUpperCase();

  return RsaUtil.sign(MERCHANT_PRIVATE_KEY, md5Str);
}

export const palmPayCreateDeposit = async (orderData) => {
  const requestId = `PP_REQ_${Date.now()}`;

  try {
    const requestTime = Date.now();
    const nonceStr = crypto.randomBytes(16).toString("hex");

    const requestBody = {
      requestTime,
      version: "V1.1",
      nonceStr,
      amount: Math.round(Number(orderData.amount) * 100), // Naira → kobo
      currency: "NGN",
      notifyUrl: `${process.env.BASE_URL}api/webhooks/palmpay`,
      orderId: String(orderData.orderNo).slice(0, 32),
      title: orderData.title || "Appointment Payment",
      description: orderData.description || "Medical Appointment Payment",
      callBackUrl:
        orderData.returnUrl ||
        "https://paymentgatewaybackend-580i.onrender.com/api/payment/success",
      goodsDetails: orderData.goodsDetails || '[{"goodsId":"1"}]',
    };

    Object.keys(requestBody).forEach((k) => {
      if (
        requestBody[k] === undefined ||
        requestBody[k] === null ||
        String(requestBody[k]).trim() === ""
      ) {
        delete requestBody[k];
      }
    });

    const signature = generateSignature(requestBody);

    const headers = {
      Accept: "application/json, text/plain, */*",
      CountryCode: "NG",
      Authorization: `Bearer ${MERCHANT_ID}`,
      Signature: signature,
      "Content-Type": "application/json",
    };

    const requestConfig = {
      method: "POST",
      url: `${BASE_URL}api/v2/payment/merchant/createorder`,
      headers,
      data: requestBody,
      timeout: 15000,
    };

    console.log(`[${requestId}] Entire request being sent:`, JSON.stringify(requestConfig, null, 2));

    const response = await axios(requestConfig);

    console.log(
      `[${requestId}] PalmPay Response:`,
      JSON.stringify(response.data, null, 2)
    );
    return response.data;
  } catch (error) {
    console.error(
      `[${requestId}] PalmPay Error:`,
      error.response?.data || error.message
    );
    throw error;
  }
};