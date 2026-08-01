// src/middleware/adminAuth.middleware.js
//
// The admin dashboard authenticates against the ZHS "records" backend (the
// natural home for identity + roles), not this service. This service has no
// User row corresponding to that admin's id, so — unlike the regular
// src/middleware/auth.middleware.js, which looks a user up locally — this
// middleware trusts the JWT's claims directly.
//
// REQUIREMENT: JWT_SECRET must be set to the exact same value in both this
// service's and the ZHS backend's environment variables, or tokens issued by
// ZHS will fail verification here (same requirement as INTERNAL_API_KEY
// already documented in .env.example).
import jwt from 'jsonwebtoken';

export const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role || 'USER' };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions for this action' });
  }
  next();
};

export const ANY_STAFF = ['SUPER_ADMIN', 'TECH_SUPPORT', 'CUSTOMER_CARE', 'FINANCE', 'AUDITOR'];
