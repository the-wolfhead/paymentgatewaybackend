import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../config/prisma.js';
import { createDoubleEntry } from '../services/doubleLedger.service.js';

const connection = new IORedis();

new Worker(
  'payments',
  async (job) => {
    const { accountNumber, amount, reference } = job.data;

    const walletAccount = await prisma.account.findFirst({
      where: { name: accountNumber },
    });

    const systemAccount = await prisma.account.findFirst({
      where: { type: 'SYSTEM' },
    });

    if (!walletAccount || !systemAccount) return;

    await createDoubleEntry({
      debitAccountId: systemAccount.id,
      creditAccountId: walletAccount.id,
      amount,
      reference,
      narration: 'PalmPay funding',
    });
  },
  { connection }
);
