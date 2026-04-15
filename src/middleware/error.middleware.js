import { logger } from '../config/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error(err.message);

  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
  });
};
