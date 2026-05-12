// src/jobs/queue.js
import Bull from 'bull';

const paymentQueue = new Bull('payment-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
});

export { paymentQueue };
