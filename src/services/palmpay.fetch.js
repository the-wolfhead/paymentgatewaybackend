import axios from "axios";
import crypto from "crypto";               // Built-in Node.js module
import { RsaUtil } from "../config/rsaUtil.js";   // Path to the RsaUtil we created earlier

// Your secure keys from .env (never commit these!)
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY; // Base64 private key (backend)
const PALMPAY_PUBLIC_KEY = process.env.PALMPAY_PUBLIC_KEY;             // PalmPay's public key for verification

export const fetchPalmPayTransactions = async (queryParams = {}) => {
  try {
    // 1. Prepare the request payload (body)
    const requestBody = {
      timestamp: Math.floor(Date.now() / 1000),        // Unix timestamp in seconds
      nonce: crypto.randomBytes(16).toString("hex"),   // Prevents replay attacks
      ...queryParams,                                  // e.g. { page: 1, limit: 20, startDate: "2026-01-01", endDate: "2026-04-16", status: "SUCCESS" }
    };

    // 2. Create the string to sign
    // Sort keys alphabetically and join as "key1=value1&key2=value2&..."
    const sortedString = Object.keys(requestBody)
      .sort()
      .map((key) => `${key}=${requestBody[key]}`)
      .join("&");

    // 3. Generate RSA signature (RSA-SHA1 - standard for PalmPay)
    const signature = RsaUtil.sign(MERCHANT_PRIVATE_KEY, sortedString);

    // 4. Make the POST request
    const res = await axios.post(
      "https://api.palmpay.com/transactions",   // Change endpoint if PalmPay uses a different path (e.g. /v1/transactions/query)
      requestBody,                              // Send as JSON body
      {
        headers: {
          "Content-Type": "application/json",
          "Sign": signature,                    // Most common header name
          // You may also need these headers depending on PalmPay docs:
          // "Merchant-Id": process.env.PALMPAY_MERCHANT_ID,
          // "Public-Key": "your_uploaded_public_key_base64",  // if required
        },
      }
    );

    // Optional: Verify PalmPay's response signature (highly recommended)
    const responseSign = res.headers["sign"] || res.data?.sign;
    if (responseSign && PALMPAY_PUBLIC_KEY) {
      // Rebuild the exact same sorted string from the response data (adjust fields as per PalmPay spec)
      const responseDataForVerify = { ...res.data }; // Remove 'sign' field if present
      delete responseDataForVerify.sign;

      const responseSortedString = Object.keys(responseDataForVerify)
        .sort()
        .map((key) => `${key}=${responseDataForVerify[key]}`)
        .join("&");

      const isValid = RsaUtil.verify(PALMPAY_PUBLIC_KEY, responseSortedString, responseSign);

      if (!isValid) {
        throw new Error("Invalid signature from PalmPay response - possible tampering");
      }
    }

    // Return the transactions (adjust based on actual response structure)
    return res.data?.transactions || res.data?.data || res.data;

  } catch (error) {
    console.error("PalmPay Fetch Transactions Error:", 
      error.response?.data || error.message);
    throw error;
  }
};
