// scripts/seedSystemAccounts.js
//
// transfer.service.js, withdrawal.service.js, escrow.service.js, and
// walletService.js all look up system/contra accounts by accountNumber via
// findFirst() and throw if they're missing. Nothing in this repo ever
// created them. Run this once against your database before using those
// flows:
//
//   npm run seed
import { prisma } from '../src/config/prisma.js';

const SYSTEM_ACCOUNTS = [
  { accountNumber: 'SYSTEM_REVENUE', type: 'FEES' },
  { accountNumber: 'SYSTEM_PAYOUT', type: 'SYSTEM' },
  { accountNumber: 'SYSTEM_DEPOSITS', type: 'SYSTEM' },
  { accountNumber: 'ESCROW_ACCOUNT', type: 'ESCROW' },
];

async function main() {
  for (const acc of SYSTEM_ACCOUNTS) {
    const existing = await prisma.account.findFirst({
      where: { accountNumber: acc.accountNumber },
    });

    if (existing) {
      console.log(`✓ ${acc.accountNumber} already exists`);
      continue;
    }

    await prisma.account.create({ data: acc });
    console.log(`✅ Created ${acc.accountNumber}`);
  }
}

main()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
