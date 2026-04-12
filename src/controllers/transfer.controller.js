import { transferFunds } from '../services/transfer.service.js';

export const transfer = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiverId, amount } = req.body;

    if (!receiverId || !amount) {
      throw new Error('Missing fields');
    }

    const result = await transferFunds({
      senderId,
      receiverId,
      amount,
    });

    res.json({
      message: 'Transfer successful',
      reference: result,
    });
  } catch (err) {
    next(err);
  }
};
