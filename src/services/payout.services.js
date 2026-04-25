// src/services/payout.service.js

import axios from "axios";

export const sendPayout = async ({ amount, accountNumber, bankCode, name, reference }) => {
  const res = await axios.post(
    "https://api.palmpay.com/transfer",
    {
      amount,
      accountNumber,
      bankCode,
      accountName: name,
      reference,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PALMPAY_SECRET}`,
      },
    }
  );

  return res.data;
};
