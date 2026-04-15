// src/controllers/escrow.controller.js

import {
  createEscrow,
  releaseEscrow,
  cancelEscrow,
} from "../services/escrow.service.js";

export const create = async (req, res, next) => {
  try {
    const { sellerId, amount } = req.body;

    const ref = await createEscrow({
      buyerId: req.user.id,
      sellerId,
      amount,
    });

    res.json({ message: "Escrow created", reference: ref });
  } catch (err) {
    next(err);
  }
};

export const release = async (req, res, next) => {
  try {
    await releaseEscrow(req.body.reference);
    res.json({ message: "Escrow released" });
  } catch (err) {
    next(err);
  }
};

export const cancel = async (req, res, next) => {
  try {
    await cancelEscrow(req.body.reference);
    res.json({ message: "Escrow cancelled" });
  } catch (err) {
    next(err);
  }
};
