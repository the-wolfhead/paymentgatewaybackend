// src/controllers/deposit.controller.js
import {prisma} from '../config/prisma.js';
import { palmPayCreateDeposit } from '../services/palmpayService.js';

export const initiateDeposit = async (req, res) => {
  const requestId = `REQ_${Date.now()}`;

  try {
    const { amount, gateway = 'PALMPAY', description, userId, metadata = {} } = req.body;

    // === Input Validation ===
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
        requestId,
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
        requestId,
      });
    }

    const finalAmount = Number(amount);
    const reference = `DEP_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // === Create Transaction Record ===
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        id: `txn_${Date.now()}_${Math.floor(Math.random() * 10000)}`, // Generate ID manually
        type: "DEPOSIT",
        amount: finalAmount,
        currency: "NGN",
        gateway: gateway.toUpperCase(),
        reference,
        status: "PENDING",
        description: description || `Deposit via ${gateway}`,
        metadata: {
          ...metadata,
          initiatedAt: new Date().toISOString(),
        },
      }
    });

    let gatewayResponse = null;

    // === Process Payment with Gateway ===
    if (gateway.toUpperCase() === 'PALMPAY') {
      try {
        gatewayResponse = await palmPayCreateDeposit({
          orderNo: reference,
          amount: finalAmount,
          description: description || "Medical Appointment Payment",
          returnUrl: metadata.returnUrl || `${process.env.FRONTEND_URL}/payment-success?ref=${reference}`,
        });
      } catch (gatewayError) {
        console.error(`[${requestId}] PalmPay API Error:`, gatewayError.response?.data || gatewayError.message);

        // Update transaction as failed
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED", gatewayResponse: gatewayError.response?.data }
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
        message: `Gateway '${gateway}' is not supported yet`,
        requestId,
      });
    }

    // === Update Transaction with Gateway Data ===
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        gatewayReference: gatewayResponse?.orderNo || gatewayResponse?.data?.orderNo,
        metadata: {
          ...transaction.metadata,
          checkoutUrl: gatewayResponse?.checkoutUrl || gatewayResponse?.data?.checkoutUrl,
          gatewayRawResponse: gatewayResponse,
        }
      }
    });

    // === Success Response ===
    return res.status(200).json({
      success: true,
      message: "Deposit initiated successfully",
      reference: updatedTransaction.reference,
      checkoutUrl: gatewayResponse?.checkoutUrl || gatewayResponse?.data?.checkoutUrl,
      requestId,
    });

  } catch (error) {
    console.error(`[${requestId}] Deposit Initiation Error:`, error);

    // Handle Prisma-specific errors
    if (error.code) {
      if (error.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: "Duplicate reference error",
          requestId,
        });
      }
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: "User not found",
          requestId,
        });
      }
    }

    // Generic server error (never expose internal details in production)
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while processing your payment",
      requestId,
    });
  }
};
