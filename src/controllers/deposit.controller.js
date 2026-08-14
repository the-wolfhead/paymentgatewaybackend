// src/controllers/deposit.controller.js
import { prisma } from '../config/prisma.js';
import { palmPayCreateDeposit } from '../services/palmpayService.js';

/**
 * Lets the app poll for the real outcome of a deposit after the user
 * finishes (or abandons) the PalmPay checkout WebView. The webhook is what
 * actually flips this to SUCCESS/FAILED once PalmPay confirms — this just
 * lets the client find out once that's happened.
 */
export const getDepositStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    const transaction = await prisma.transaction.findUnique({
      where: { reference },
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    return res.json({
      success: true,
      status: transaction.status, // PENDING | SUCCESS | FAILED
      reference: transaction.reference,
      amount: transaction.amount,
    });
  } catch (error) {
    console.error('Deposit status check error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check deposit status' });
  }
};

export const initiateDeposit = async (req, res) => {
  const requestId = `REQ_${Date.now()}`;

  try {
    const { amount, gateway = 'PALMPAY', description, userId, purpose = 'APPOINTMENT', metadata = {} } = req.body;

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
         meta: {                    // ← This is the correct field name in your schema
          ...metadata,
          purpose, // 'APPOINTMENT' | 'WALLET_TOPUP'
          description: description || `Appointment with doctor`, // Store description inside meta
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
          userId,

          // Clean return URL
          returnUrl: "https://paymentgatewaybackend-580i.onrender.com/api/payment/success?ref=" + reference,
        });
      } catch (gatewayError) {
        console.error(`[${requestId}] PalmPay Error:`, gatewayError.message || gatewayError);

        // Mark transaction as failed
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
        message: `Gateway ${gateway} is not supported`,
        requestId,
      });
    }

    // Extract the checkout URL. Previously this only checked
    // `data.checkoutUrl`/`checkoutUrl` — an unverified guess at PalmPay's
    // actual field name. If it's wrong, this silently returns success:true
    // with checkoutUrl: undefined, and the app has nothing to open. Trying
    // several plausible field names, and logging the full raw response so
    // the real field name can be confirmed from the logs if none of these hit.
    const d = gatewayResponse?.data || gatewayResponse || {};
    const checkoutUrl =
      d.checkoutUrl || d.url || d.link || d.payUrl || d.cashierUrl ||
      d.redirectUrl || d.h5Url || d.orderUrl;

    if (!checkoutUrl) {
      console.error(
        `[${requestId}] PalmPay returned success but no recognizable checkout URL field. ` +
        `Full response:`, JSON.stringify(gatewayResponse, null, 2)
      );

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "FAILED", meta: { ...(transaction.meta || {}), rawResponse: gatewayResponse } },
      });

      return res.status(502).json({
        success: false,
        message: "Payment gateway did not return a checkout link. Check server logs for the raw PalmPay response.",
        requestId,
      });
    }

    // Update transaction with gateway response
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        meta: {
          ...(transaction.meta || {}),
          gatewayOrderId: d.orderId,
          checkoutUrl,
          rawResponse: gatewayResponse,
        },
      }
    });

    return res.json({
      success: true,
      reference: transaction.reference,
      checkoutUrl,
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
