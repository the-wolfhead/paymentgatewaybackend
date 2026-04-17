import crypto from 'crypto';
import { Buffer } from 'buffer';

export class RsaUtil {
  /**
   * Generate 2048-bit RSA key pair (exactly like PalmPay's Java RsaUtil)
   * Returns Base64-encoded keys (private = PKCS#8 DER, public = SPKI DER)
   */
  static generateKeyPair() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'der'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der'
      }
    });

    return {
      privateKey: privateKey.toString('base64'),
      publicKey: publicKey.toString('base64')
    };
  }

  /**
   * Sign data (used by your backend when calling PalmPay APIs)
   * PalmPay uses RSA-SHA1 (confirmed in real integrations)
   * @param {string} privateKeyBase64 - Your private key (base64)
   * @param {string} dataToSign - The string to sign (usually sorted params like "a=1&b=2&c=3")
   * @returns {string} Base64 signature
   */
  static sign(privateKeyBase64, dataToSign) {
    const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');

    const signer = crypto.createSign('RSA-SHA1');
    signer.update(dataToSign);
    const signature = signer.sign(privateKeyBuffer);

    return signature.toString('base64');
  }

  /**
   * Verify signature (used when PalmPay calls back to your notify URL)
   * @param {string} publicKeyBase64 - PalmPay's public key or your own (base64)
   * @param {string} dataToVerify - Same string that was signed
   * @param {string} signatureBase64 - Signature received from PalmPay
   * @returns {boolean} true if valid
   */
  static verify(publicKeyBase64, dataToVerify, signatureBase64) {
    const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');

    const verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(dataToVerify);

    return verifier.verify(publicKeyBuffer, signatureBuffer);
  }
}
