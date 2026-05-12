// src/controllers/deposit.controller.js
import prisma from '../config/prisma.js';
import { palmPayCreateDeposit } from '../services/palmpayService.js';

export const initiateDeposit = async (req, res) => {
  try {
    const { amount, gateway = 'PALMPAY', description, userId, metadata = {} } = req.body;

    // Basic validation
    if (!amount || !userId) {
      return res.status(400).json({
        success: false,
        message: "Amount and userId are required"
      });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than zero"
      });
    }

    // Generate unique reference
    const reference = `DEP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Create transaction record first
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: "DEPOSIT",
        amount: Number(amount),
        currency: "NGN",
        gateway: gateway.toUpperCase(),
        reference,
        status: "PENDING",
        description: description || `Deposit via ${gateway}`,
        metadata: metadata,           // Store doctor, appointment details, etc.
      }
    });

    let responseData = {};

    // === PalmPay Integration ===
    if (gateway.toUpperCase() === 'PALMPAY') {
      const palmPayResponse = await palmPayCreateDeposit({
        orderNo: reference,
        amount: Number(amount),
        description: description || "Medical Appointment Payment",
        returnUrl: metadata.returnUrl || `${process.env.FRONTEND_URL}/payment-success?ref=${reference}`,
        // You can pass more fields if needed
      });

      responseData = {
        checkoutUrl: palmPayResponse?.checkoutUrl || palmPayResponse?.data?.checkoutUrl,
        orderNo: palmPayResponse?.orderNo,
      };
    } 
    // === Add other gateways later (Paystack, Flutterwave, etc.) ===
    else {
      return res.status(400).json({
        success: false,
        message: `Gateway ${gateway} is not supported yet`
      });
    }

    // Update transaction with gateway response
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        gatewayReference: responseData.orderNo,
        metadata: {
          ...transaction.metadata,
          ...responseData
        }
      }
    });

    return res.json({
      success: true,
      reference: transaction.reference,
      checkoutUrl: responseData.checkoutUrl,
      message: "Deposit initiated successfully"
    });

  } catch (error) {
    console.error("Deposit initiation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate payment",
      error: error.message
    });
  }
};
