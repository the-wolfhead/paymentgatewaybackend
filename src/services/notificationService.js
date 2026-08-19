// src/services/notificationService.js
import axios from 'axios';

const BACKEND_ZHS_URL = (process.env.BACKEND_ZHS_URL || "https://zhs-backend-1.onrender.com").replace(/\/$/, "");
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
  console.warn("⚠️ INTERNAL_API_KEY is missing in .env file!");
}

/**
 * Notify backendzhs after successful payment
 */
export const notifyBackendZHS = async (data) => {
  const requestId = `NOTIF_${Date.now()}`;

  try {
    // This is the exact appointment form sent to the ZHS appointment API.
    // Keep paymentReference in the body so the receiving API can make the
    // operation idempotent.
    const payload = {
      userId: data.userId,
      doctorId: data.doctorId,
      patientName: data.patientName,
      date: data.date,
      time: data.time,
      fee: data.fee,
      paymentReference: data.paymentReference,
      source: "PAYMENT_GATEWAY",
      metadata: data.metadata || {}
    };

    const response = await axios.post(
      `${BACKEND_ZHS_URL}/appointments/create`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': INTERNAL_API_KEY,
        },
        timeout: 10000,
      }
    );

    console.log(`[${requestId}] ✅ Successfully notified backendzhs`);
    return {
      success: response.data?.success !== false,
      data: response.data,
      status: response.status,
    };

  } catch (error) {
    console.error(`[${requestId}] ❌ Notification to backendzhs failed:`);
    
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response:", error.response.data);
    } else {
      console.error(error.message);
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
      data: error.response?.data,
    };
  }
};
