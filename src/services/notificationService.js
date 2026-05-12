// src/services/notificationService.js
import axios from 'axios';

const BACKEND_ZHS_URL = process.env.BACKEND_ZHS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const notifyBackendZHS = async (data) => {
  const requestId = `NOTIF_${Date.now()}`;

  try {
    const payload = {
      userId: data.userId,
      doctorId: data.doctorId,
      patientName: data.patientName,
      date: data.date,
      time: data.time,
      fee: data.fee,
      paymentReference: data.paymentReference,
      source: "PAYMENT_GATEWAY",           // ← Important flag
      metadata: data.metadata || {}
    };

    const response = await axios.post(
      `${BACKEND_ZHS_URL}/api/appointments/create`,   // Use existing endpoint
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': INTERNAL_API_KEY,
        },
        timeout: 8000,
      }
    );

    console.log(`[${requestId}] ✅ backendzhs notified successfully`);
    return response.data;

  } catch (error) {
    console.error(`[${requestId}] Notification failed:`, error.message);
    return { success: false, error: error.message };
  }
};
