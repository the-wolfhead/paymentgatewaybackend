/**
 * Admin dashboard tokens are issued by the ZHS records backend:
 *   jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' })
 *
 * This service must verify with the SAME secret. Set on the payment API:
 *   JWT_SECRET=<identical value to ZHS>
 *
 * Optional aliases (first match wins):
 *   JWT_SECRET | ZHS_JWT_SECRET | ADMIN_JWT_SECRET
 */
import jwt from 'jsonwebtoken';

function resolveJwtSecrets() {
  const secrets = [
    process.env.JWT_SECRET,
    process.env.ZHS_JWT_SECRET,
    process.env.ADMIN_JWT_SECRET,
  ].filter((s) => typeof s === 'string' && s.trim().length > 0);

  // Deduplicate
  return [...new Set(secrets.map((s) => s.trim()))];
}

function extractBearer(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]; // raw token
  if (parts[0].toLowerCase() === 'bearer' && parts[1]) return parts[1];
  return null;
}

export const verifyAdminToken = (req, res, next) => {
  const token = extractBearer(req.headers['authorization'] || req.headers['Authorization']);

  if (!token) {
    return res.status(401).json({
      error: 'Access denied, token missing',
      hint: 'Send Authorization: Bearer <token> from ZHS admin login',
    });
  }

  const secrets = resolveJwtSecrets();
  if (!secrets.length) {
    console.error('[adminAuth] No JWT_SECRET configured on payment API');
    return res.status(500).json({
      error: 'Payment API JWT_SECRET is not configured',
      hint: 'Set JWT_SECRET on the payment service to the same value as the ZHS backend',
    });
  }

  let lastErr = null;
  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret, {
        // small clock skew tolerance between hosts
        clockTolerance: 30,
      });

      const id = decoded.id || decoded.userId || decoded.sub;
      const role = decoded.role || decoded.userRole || 'USER';

      if (!id) {
        return res.status(403).json({
          error: 'Invalid token payload',
          hint: 'Token must include id (or userId) claim from ZHS login',
        });
      }

      req.user = { id, role };
      return next();
    } catch (err) {
      lastErr = err;
    }
  }

  const name = lastErr?.name || 'JsonWebTokenError';
  const message = lastErr?.message || 'Invalid or expired token';

  console.warn(`[adminAuth] JWT verify failed: ${name}: ${message}`);

  if (name === 'TokenExpiredError') {
    return res.status(403).json({
      error: 'Token expired',
      hint: 'Sign out of the admin dashboard and sign in again',
    });
  }

  // Most common production issue: secrets differ between ZHS and payment
  return res.status(403).json({
    error: 'Invalid or expired token',
    reason: name,
    hint:
      'JWT verification failed. Ensure payment API JWT_SECRET is EXACTLY the same string as ZHS backend JWT_SECRET (no extra spaces/quotes), then restart both services and sign in again.',
  });
};

export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      error: 'Insufficient permissions for this action',
      yourRole: req.user?.role || null,
      requiredRoles: allowedRoles,
    });
  }
  next();
};

export const ANY_STAFF = ['SUPER_ADMIN', 'TECH_SUPPORT', 'CUSTOMER_CARE', 'FINANCE', 'AUDITOR'];
