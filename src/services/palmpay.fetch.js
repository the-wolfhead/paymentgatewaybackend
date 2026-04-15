// src/services/palmpay.fetch.js

import axios from "axios";

export const fetchPalmPayTransactions = async () => {
  const res = await axios.get(
    "https://api.palmpay.com/transactions",
    {
      headers: {
        Authorization: `Bearer ${process.env.PALMPAY_SECRET}`,
      },
    }
  );

  return res.data.transactions;
};
