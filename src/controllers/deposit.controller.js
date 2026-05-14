// src/controllers/deposit.controller.js
import { prisma } from '../config/prisma.js';
import { palmPayCreateDeposit } from '../services/palmpayService.js';

export const initiateDeposit = async (req, res) => {
  const requestId = `REQ_${Date.now()}`;

  try {
    const { amount, gateway = 'PALMPAY', description, userId, metadata = {} } = req.body;

    if (!userId || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "userId and valid amount are required",
        requestId,
      });
    }

    const finalAmount = Number(amount);
    const reference = `DEP_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const transactionId = `txn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = new Date();

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        id: transactionId,
        userId,
        type: "PAYMENT",
        channel: "CARD",
        amount: finalAmount,
        currency: "NGN",
        status: "PENDING",
        reference,
        description: description || `Appointment Payment`,
        meta: {
          ...metadata,
          initiatedAt: now.toISOString(),
        },
        createdAt: now,
        updatedAt: now,
      }
    });

    let gatewayResponse = null;

    if (gateway.toUpperCase() === 'PALMPAY') {
      try {
        gatewayResponse = await palmPayCreateDeposit({
          orderNo: reference,
          amount: finalAmount,
          description: description || "Medical Appointment Payment",
          // Use a clean, short return URL for now
          returnUrl: `https://paymentgatewaybackend-580i.onrender.com/api/payment/success?ref=${reference}`,
        });
      } catch (gatewayError) {
        console.error(`[${requestId}] PalmPay Gateway Error:`, gatewayError.message);

        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED", updatedAt: new Date() }
        });

        return res.status(502).json({
          success: false,
          message: "Payment gateway error. Please try again.",
          requestId,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: `Gateway ${gateway} is not supported yet`,
        requestId,
      });
    }

    // Update transaction with gateway response
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        gatewayReference: gatewayResponse?.orderNo || gatewayResponse?.data?.orderNo,
        meta: {
          ...(transaction.meta || {}),
          checkoutUrl: gatewayResponse?.checkoutUrl || gatewayResponse?.data?.checkoutUrl,
        },
        updatedAt: new Date()
      }
    });

    return res.json({
      success: true,
      reference: transaction.reference,
      checkoutUrl: gatewayResponse?.checkoutUrl || gatewayResponse?.data?.checkoutUrl,
      message: "Deposit initiated successfully",
      requestId,
    });

  } catch (error) {
    console.error(`[${requestId}] Deposit Initiation Error:`, error);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate payment. Please try again.",
      requestId,
    });
  }
};
