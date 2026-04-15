import Joi from 'joi';

export const transferSchema = Joi.object({
  receiverId: Joi.string().required(),
  amount: Joi.number().positive().required(),
});
