// src/services/palmpayService.js
import axios from "axios";
import crypto from "crypto";
import { RsaUtil } from "../utils/rsaUtil.js";

const BASE_URL =
  process.env.PALMPAY_BASE_URL || "https://open-gw-prod.palmpay-inc.com/";
const MERCHANT_ID = process.env.PALMPAY_AUTH_TOKEN; // AppId
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;

/**
 * Build the string that must be signed according to PalmPay docs:
 * 1. Keep only non-empty values
 * 2. Sort keys by ASCII (lexicographic)
 * 3. Join as key1=value1&key2=value2...
 */
function buildSignString(params) {
  return Object.keys(params)
    .filter((key) => {
      const val = params[key];
      return val !== undefined && val !== null && String(val).trim() !== "";
    })
    .sort() // ASCII / lexicographic order
    .map((key) => `${key}=${String(params[key]).trim()}`)
    .join("&");
}

/**
 * PalmPay signature:
 * strA  → MD5(strA).toUpperCase() → SHA1WithRSA(privateKey, md5Str)
 */
function generateSignature(body) {
  const strA = buildSignString(body);
  const md5Str = crypto
    .createHash("md5")
    .update(strA, "utf8")
    .digest("hex")
    .toUpperCase();

  // RsaUtil.sign must perform SHA1WithRSA on the md5Str
  // and return the Base64 (or whatever format PalmPay expects) signature
  return RsaUtil.sign(MERCHANT_PRIVATE_KEY, md5Str);
}

export const palmPayCreateDeposit = async (orderData) => {
  const requestId = `PP_REQ_${Date.now()}`;

  try {
    const requestTime = Date.now();
    const nonceStr = crypto.randomBytes(16).toString("hex"); // 32 hex chars

    // Official createorder body (V1.1)
    // - amount is in smallest unit (kobo), integer, no decimal
    // - orderId ≤ 32 alphanumeric chars
    // - goodsDetails is a JSON-array *string*
    const requestBody = {
      requestTime,
      version: "V1.1",
      nonceStr,
      amount: Math.round(Number(orderData.amount)), // must be integer
      currency: "NGN",
      notifyUrl: `${process.env.BASE_URL}/api/v2/payment/merchant/createorder`,
      orderId: String(orderData.orderNo).slice(0, 32),
      title: orderData.title || "Appointment Payment",
      description: orderData.description || "Medical Appointment Payment",
      callBackUrl:
        orderData.returnUrl ||
        "https://paymentgatewaybackend-580i.onrender.com/api/payment/success",
      goodsDetails: orderData.goodsDetails || '[{"goodsId":"1"}]',
      // Optional – only include if you actually need them
      // productType: orderData.productType || "pay_wallet",
      // customerInfo: orderData.customerInfo, // JSON string if required
      // remark: orderData.remark,
    };

    // Remove any accidental empty values before signing
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

    console.log(`\n[${requestId}] === SENDING TO PALMPAY ===`);
    console.log("URL:", `${BASE_URL}api/v2/payment/merchant/createorder`);
    console.log("AppId (Authorization):", MERCHANT_ID);
    console.log("Order ID:", requestBody.orderId);
    console.log("Amount (kobo):", requestBody.amount);
    console.log("Sign string (strA):", buildSignString(requestBody));
    console.log("Signature:", signature);

    const response = await axios.post(
      `${BASE_URL}/api/v2/payment/merchant/createorder`,
      requestBody,
      {
        headers: {
          Accept: "application/json, text/plain, */*",
          CountryCode: "NG",
          Authorization: `Bearer ${MERCHANT_ID}`,
          Signature: signature,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

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