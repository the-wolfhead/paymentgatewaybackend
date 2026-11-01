/**
 * Admin dashboard tokens are issued by the ZHS records backend:
 *   jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' })
 *
 * Payment API must use the identical secret.
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

function resolveJwtSecrets() {
  const secrets = [
    process.env.JWT_SECRET,
    process.env.ZHS_JWT_SECRET,
    process.env.ADMIN_JWT_SECRET,
  ].filter((s) => typeof s === 'string' && s.trim().length > 0);
  return [...new Set(secrets.map((s) => s.trim()))];
}

/** Non-secret fingerprint so you can compare secrets across services without printing them */
export function jwtSecretFingerprint(secret) {
  if (!secret) return null;
  return crypto.createHash('sha256').update(String(secret).trim()).digest('hex').slice(0, 12);
}

function extractBearer(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  if (parts[0].toLowerCase() === 'bearer' && parts[1]) return parts[1];
  return null;
}

function decodeUnverified(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8'
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const verifyAdminToken = (req, res, next) => {
  const token = extractBearer(req.headers['authorization'] || req.headers['Authorization']);

  if (!token) {
    console.warn('[adminAuth] missing Authorization header');
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

  const unverified = decodeUnverified(token);
  let lastErr = null;

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret, { clockTolerance: 60 });
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
  const secretFp = jwtSecretFingerprint(secrets[0]);

  console.warn(
    `[adminAuth] JWT verify failed: ${name}: ${message} | ` +
      `tokenLen=${token.length} | claims=${JSON.stringify({
        id: unverified?.id || unverified?.userId,
        role: unverified?.role,
        exp: unverified?.exp,
        iat: unverified?.iat,
      })} | paymentJwtSecretFp=${secretFp}`
  );

  if (name === 'TokenExpiredError') {
    return res.status(403).json({
      error: 'Token expired',
      hint: 'Sign out of the admin dashboard and sign in again',
    });
  }

  return res.status(403).json({
    error: 'Invalid or expired token',
    reason: name,
    // Safe diagnostics for operators (no secret material)
    debug: {
      tokenPresent: true,
      tokenLength: token.length,
      claimsSeen: unverified
        ? {
            id: unverified.id || unverified.userId || null,
            role: unverified.role || null,
            exp: unverified.exp || null,
            expired:
              unverified.exp != null ? unverified.exp * 1000 < Date.now() : null,
          }
        : null,
      paymentJwtSecretFingerprint: secretFp,
      hint: 'Compare paymentJwtSecretFingerprint with a SHA256 of ZHS JWT_SECRET (first 12 hex chars). If different, secrets do not match.',
    },
    hint:
      'JWT verification failed. Set payment JWT_SECRET to the EXACT same string as ZHS JWT_SECRET, restart payment API, then log out/in on admin.',
  });
};

/**
 * GET /api/admin/auth-debug — no auth required.
 * Returns whether JWT_SECRET is set and fingerprint for cross-service comparison.
 * Does not accept or echo secrets.
 */
export const authDebug = (req, res) => {
  const secrets = resolveJwtSecrets();
  const token = extractBearer(req.headers['authorization'] || req.headers['Authorization']);
  const unverified = token ? decodeUnverified(token) : null;

  let verifyResult = null;
  if (token && secrets.length) {
    for (const secret of secrets) {
      try {
        const decoded = jwt.verify(token, secret, { clockTolerance: 60 });
        verifyResult = {
          ok: true,
          id: decoded.id || decoded.userId || decoded.sub,
          role: decoded.role || null,
        };
        break;
      } catch (err) {
        verifyResult = { ok: false, reason: err.name, message: err.message };
      }
    }
  } else if (!token) {
    verifyResult = { ok: false, reason: 'NO_TOKEN' };
  } else {
    verifyResult = { ok: false, reason: 'NO_SECRET' };
  }

  res.json({
    paymentService: 'ok',
    jwtSecretConfigured: secrets.length > 0,
    jwtSecretFingerprint: secrets[0] ? jwtSecretFingerprint(secrets[0]) : null,
    tokenProvided: Boolean(token),
    tokenClaims: unverified
      ? {
          id: unverified.id || unverified.userId || null,
          role: unverified.role || null,
          exp: unverified.exp || null,
          iat: unverified.iat || null,
        }
      : null,
    verifyResult,
    howToCompare:
      'On ZHS host, fingerprint is first 12 hex chars of sha256(JWT_SECRET). Must equal jwtSecretFingerprint above.',
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
