// src/services/notificationService.js
import axios from 'axios';

const BACKEND_ZHS_URL = process.env.BACKEND_ZHS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!BACKEND_ZHS_URL || !INTERNAL_API_KEY) {
  console.warn("⚠️  BACKEND_ZHS_URL or INTERNAL_API_KEY is missing in .env");
}

/**
 * Notify the main backend (backendzhs) after successful payment
 * This will trigger appointment booking
 */
export const notifyBackendZHS = async (appointmentData) => {
  const requestId = `NOTIF_${Date.now()}`;

  try {
    if (!BACKEND_ZHS_URL) {
      throw new Error("BACKEND_ZHS_URL is not configured");
    }

    console.log(`[${requestId}] Notifying backendzhs to create appointment...`);

    const payload = {
      userId: appointmentData.userId,
      doctorId: appointmentData.doctorId,
      patientName: appointmentData.patientName,
      date: appointmentData.date,
      time: appointmentData.time,
      fee: appointmentData.fee,
      paymentReference: appointmentData.paymentReference,
      paymentGateway: appointmentData.paymentGateway || "PALMPAY",
      metadata: appointmentData.metadata || {},
      source: "PAYMENT_GATEWAY",
      timestamp: new Date().toISOString()
    };

    const response = await axios.post(
      `${BACKEND_ZHS_URL}/api/appointments/create-from-payment`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': INTERNAL_API_KEY,
        },
        timeout: 10000,
      }
    );

    if (response.data.success) {
      console.log(`[${requestId}] ✅ Successfully notified backendzhs. Appointment created.`);
      return { success: true, appointment: response.data.appointment };
    } else {
      console.warn(`[${requestId}] Backendzhs returned failure:`, response.data);
      return { success: false, message: response.data.message };
    }

  } catch (error) {
    console.error(`[${requestId}] Failed to notify backendzhs:`);

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else if (error.request) {
      console.error("No response received from backendzhs (Network/Timeout)");
    } else {
      console.error("Error:", error.message);
    }

    // Don't throw — we still want the payment to be marked successful
    return {
      success: false,
      message: "Notification to main backend failed",
      error: error.message
    };
  }
};
