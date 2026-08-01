// src/services/palmpayService.js
import axios from "axios";
import crypto from "crypto";
import { RsaUtil } from "../utils/rsaUtil.js";
const BASE_URL = process.env.PALMPAY_BASE_URL || "https://open-gw-daily.palmpay-inc.com";
const MERCHANT_ID = process.env.PALMPAY_MERCHANT_ID; // this is the AppId PalmPay's docs refer to
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;

export const palmPayCreateDeposit = async (orderData) => {
  const requestId = `PP_REQ_${Date.now()}`;
  try {
    const requestTime = Date.now();
    const nonceStr = crypto.randomBytes(16).toString("hex");

    // Fixed to match PalmPay's actual documented request body for
    // createorder — previously this sent a `merchantId` field (not part of
    // their spec at all — merchant identity is conveyed via the
    // Authorization header, not the body) plus two entirely invented fields
    // (`customerInfo`, `remark`) that don't appear anywhere in their docs.
    // It was also missing `userId`, which their spec lists as a required
    // field in both of their own examples.
    const requestBody = {
      requestTime,
      version: "V1.1",
      nonceStr,
      amount: Number(orderData.amount),
      currency: "NGN",
      notifyUrl: `${process.env.BASE_URL}/api/webhooks/palmpay`,
      orderId: orderData.orderNo,
      title: "Appointment Payment",
      description: orderData.description || "Medical Appointment Payment",
      userId: orderData.userId,
      callBackUrl: orderData.returnUrl || "https://paymentgatewaybackend-580i.onrender.com/api/payment/success",
      goodsDetails: '[{"goodsId": "1"}]',
      // NOTE: PalmPay's own curl example includes this for a hosted-checkout
      // createorder call. "pay_wallet" is the only value shown in their
      // docs — verify with PalmPay support/dashboard whether a different
      // productType is needed for a card-based hosted checkout page vs.
      // paying from a PalmPay wallet balance.
      productType: orderData.productType || "pay_wallet",
    };

    // Build sign string (important: follow exact order if specified by PalmPay)
    const signString = Object.keys(requestBody)
      .sort()
      .map(key => `${key}=${requestBody[key]}`)
      .join('&');

    const signature = RsaUtil.sign(MERCHANT_PRIVATE_KEY, signString);

   // === DETAILED LOGGING ===
    console.log(`\n[${requestId}] === SENDING TO PALMPAY ===`);
    console.log("URL:", `${BASE_URL}/api/v2/payment/merchant/createorder`);
    console.log("Merchant/App ID:", MERCHANT_ID);
    console.log("Order ID:", requestBody.orderId);
    console.log("Amount:", requestBody.amount);
    console.log("CallBackUrl:", requestBody.callBackUrl);

    const response = await axios.post(
      `${BASE_URL}/api/v2/payment/merchant/createorder`,
      requestBody,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'CountryCode': 'NG',
          // Fixed: PalmPay's docs are explicit — Authorization is
          // "Bearer" + AppId, not a separate opaque bearer token. Sending
          // some other token value here (as this previously did, via
          // PALMPAY_AUTH_TOKEN) is consistent with the APP_NOT_EXIST error:
          // PalmPay had no app matching whatever was in that env var.
          'Authorization': `Bearer ${MERCHANT_ID}`,
          'Signature': signature,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log(`[${requestId}] PalmPay Response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`[${requestId}] PalmPay Error:`, error.response?.data || error.message);
    throw error;
  }
};
