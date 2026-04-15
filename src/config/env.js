import dotenv from 'dotenv';
dotenv.config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'PALMPAY_SECRET'];

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing env variable: ${key}`);
  }
});

export const env = process.env;
