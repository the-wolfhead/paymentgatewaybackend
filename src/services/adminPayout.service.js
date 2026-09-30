/**
 * Admin-initiated payouts from PalmPay merchant float
 * (salary, vendor, service fees, one-off transfers).
 *
 * Does not debit a user wallet — funds leave the merchant PalmPay balance.
 * Each payout is recorded as a Transaction for audit.
 */
import { prisma } from '../config/prisma.js';
import { sendPayout, queryPayout } from './payout.service.js';
import {
  palmPayQueryBankList,
  palmPayQueryBankAccount,
  palmPayQueryMerchantBalance,
} from './palmpayService.js';

const MIN = Number(process.env.MIN_ADMIN_PAYOUT_NGN) || 100;
const MAX_BULK = Number(process.env.MAX_ADMIN_PAYOUT_BATCH) || 50;

const CATEGORIES = new Set([
  'SALARY',
  'PAYROLL',
  'VENDOR',
  'SERVICE',
  'REFUND',
  'OTHER',
]);

function makeReference(prefix = 'APO') {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7)}`.slice(0, 32);
}

/**
 * @param {object} opts
 * @param {string} opts.initiatedBy - admin user id from JWT
 * @param {number} opts.amount - Naira
 * @param {string} opts.bankCode
 * @param {string} opts.accountNumber
 * @param {string} [opts.accountName]
 * @param {string} [opts.phone]
 * @param {string} [opts.category] - SALARY | PAYROLL | VENDOR | SERVICE | REFUND | OTHER
 * @param {string} [opts.narration]
 * @param {string} [opts.beneficiaryName]
 * @param {string} [opts.employeeId]
 * @param {object} [opts.metadata]
 */
export async function createAdminPayout({
  initiatedBy,
  amount,
  bankCode,
  accountNumber,
  accountName,
  phone,
  category = 'OTHER',
  narration,
  beneficiaryName,
  employeeId,
  metadata = {},
}) {
  const naira = Number(amount);
  if (!Number.isFinite(naira) || naira < MIN) {
    throw new Error(`Minimum payout is ₦${MIN}`);
  }
  if (!bankCode || !accountNumber) {
    throw new Error('bankCode and accountNumber are required');
  }
  if (!initiatedBy) {
    throw new Error('initiatedBy (admin user) is required');
  }

  const cat = String(category || 'OTHER').toUpperCase();
  if (!CATEGORIES.has(cat)) {
    throw new Error(`Invalid category. Use one of: ${[...CATEGORIES].join(', ')}`);
  }

  const reference = makeReference('AP');
  const payeeName = accountName || beneficiaryName || 'Beneficiary';
  const now = new Date();

  const transaction = await prisma.transaction.create({
    data: {
      id: reference,
      userId: initiatedBy,
      type: 'PAYMENT',
      channel: 'BANK_TRANSFER',
      amount: naira,
      currency: 'NGN',
      status: 'PENDING',
      reference,
      meta: {
        kind: 'ADMIN_PAYOUT',
        category: cat,
        narration: narration || `${cat} payout`,
        bankCode: String(bankCode),
        accountNumber: String(accountNumber).replace(/\s+/g, ''),
        accountName: payeeName,
        beneficiaryName: beneficiaryName || payeeName,
        employeeId: employeeId || null,
        phone: phone || null,
        initiatedBy,
        ...metadata,
      },
      createdAt: now,
      updatedAt: now,
    },
  });

  try {
    const payout = await sendPayout({
      amount: naira,
      accountNumber: String(accountNumber).replace(/\s+/g, ''),
      bankCode: String(bankCode),
      name: payeeName,
      reference,
      phone,
      remark: narration || `${cat} payout`,
    });

    const finalStatus = payout.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING';

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: finalStatus,
        paystackResponse: payout.raw || payout,
        meta: {
          ...(typeof transaction.meta === 'object' && transaction.meta ? transaction.meta : {}),
          orderNo: payout.orderNo,
          orderStatus: payout.orderStatus,
          sessionId: payout.sessionId,
          fee: payout.fee,
        },
        updatedAt: new Date(),
      },
    });

    return {
      reference,
      amount: naira,
      currency: 'NGN',
      status: finalStatus,
      category: cat,
      beneficiaryName: payeeName,
      accountNumber: String(accountNumber).replace(/\s+/g, ''),
      bankCode: String(bankCode),
      payout,
    };
  } catch (err) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'FAILED',
        meta: {
          ...(typeof transaction.meta === 'object' && transaction.meta ? transaction.meta : {}),
          error: err.message,
          palmpay: err.palmpay || null,
        },
        updatedAt: new Date(),
      },
    });
    throw new Error(err.message || 'Payout failed');
  }
}

/**
 * Bulk payouts (payroll). Processes sequentially; returns per-row results.
 * @param {object} opts
 * @param {string} opts.initiatedBy
 * @param {string} [opts.category]
 * @param {string} [opts.batchLabel]
 * @param {Array} opts.items - same fields as single payout (without initiatedBy)
 */
export async function createAdminPayoutBatch({
  initiatedBy,
  category = 'PAYROLL',
  batchLabel,
  items = [],
}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items array is required');
  }
  if (items.length > MAX_BULK) {
    throw new Error(`Maximum ${MAX_BULK} payouts per batch`);
  }

  const batchId = makeReference('PB');
  const results = [];

  for (let i = 0; i < items.length; i += 1) {
    const row = items[i];
    try {
      const data = await createAdminPayout({
        initiatedBy,
        amount: row.amount,
        bankCode: row.bankCode,
        accountNumber: row.accountNumber,
        accountName: row.accountName || row.beneficiaryName,
        phone: row.phone,
        category: row.category || category,
        narration: row.narration || batchLabel || `Batch ${batchId}`,
        beneficiaryName: row.beneficiaryName || row.accountName,
        employeeId: row.employeeId,
        metadata: {
          batchId,
          batchIndex: i,
          batchLabel: batchLabel || null,
          ...(row.metadata || {}),
        },
      });
      results.push({ index: i, ok: true, ...data });
    } catch (err) {
      results.push({
        index: i,
        ok: false,
        error: err.message,
        accountNumber: row.accountNumber,
        amount: row.amount,
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return {
    batchId,
    total: results.length,
    succeeded,
    failed,
    results,
  };
}

export async function listAdminPayouts({ page = 1, pageSize = 20, category, status } = {}) {
  const take = Math.min(Number(pageSize) || 20, 100);
  const skip = (Number(page) - 1) * take;

  // Filter by meta.kind via JSON path when supported; fallback to channel + type
  const all = await prisma.transaction.findMany({
    where: {
      channel: 'BANK_TRANSFER',
      type: 'PAYMENT',
      ...(status ? { status: String(status).toUpperCase() } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const filtered = all.filter((t) => {
    const meta = t.meta && typeof t.meta === 'object' ? t.meta : {};
    if (meta.kind !== 'ADMIN_PAYOUT') return false;
    if (category && String(meta.category).toUpperCase() !== String(category).toUpperCase()) {
      return false;
    }
    return true;
  });

  const total = filtered.length;
  const items = filtered.slice(skip, skip + take).map((t) => ({
    reference: t.reference,
    amount: t.amount,
    status: t.status,
    category: t.meta?.category,
    accountNumber: t.meta?.accountNumber,
    bankCode: t.meta?.bankCode,
    beneficiaryName: t.meta?.beneficiaryName || t.meta?.accountName,
    narration: t.meta?.narration,
    batchId: t.meta?.batchId,
    initiatedBy: t.meta?.initiatedBy || t.userId,
    createdAt: t.createdAt,
  }));

  return { items, total, page: Number(page), pageSize: take };
}

export async function getAdminPayoutStatus(reference) {
  const tx = await prisma.transaction.findUnique({ where: { reference } });
  if (!tx || tx.meta?.kind !== 'ADMIN_PAYOUT') {
    throw new Error('Payout not found');
  }

  let provider = null;
  if (tx.status === 'PENDING') {
    try {
      provider = await queryPayout(reference);
    } catch (e) {
      provider = { error: e.message };
    }
  }

  return {
    reference: tx.reference,
    amount: tx.amount,
    status: tx.status,
    meta: tx.meta,
    provider,
    createdAt: tx.createdAt,
  };
}

export { palmPayQueryBankList, palmPayQueryBankAccount, palmPayQueryMerchantBalance };
