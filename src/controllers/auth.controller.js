import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, password: hashed },
    });

    // Create account for user
    await prisma.account.create({
      data: {
        userId: user.id,
        accountNumber: `ACC_${user.id}`,
        type: 'USER',
      },
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    res.json({ message: 'User created', user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) throw new Error('User not found');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('Invalid credentials');

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    res.json({ token });
  } catch (err) {
    next(err);
  }
};
