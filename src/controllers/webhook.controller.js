import { verifyPalmPaySignature } from '../utils/verifySignature.js';
import { paymentQueue } from '../jobs/queue.js';

export const palmpayWebhook = async (req, res) => {
  if (!verifyPalmPaySignature(req)) {
    return res.status(401).send('Invalid signature');
  }

  // Push to queue for async processing
  await paymentQueue.add('process-payment', req.body);

  res.sendStatus(200);
};
