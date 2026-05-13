// src/utils/rsaUtil.js
import crypto from 'crypto';

export class RsaUtil {
  /**
   * Sign data - Most reliable version for PalmPay
   */
  static sign(privateKeyBase64, dataToSign) {
    try {
      // Convert Base64 to PEM format (most compatible)
      const pemKey = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;

      const signer = crypto.createSign('RSA-SHA1');
      signer.update(dataToSign, 'utf8');

      const signature = signer.sign(pemKey);

      return signature.toString('base64');
    } catch (error) {
      console.error('RSA Sign Error Details:', error.message);
      throw new Error('Failed to generate signature. Check private key format.');
    }
  }

  /**
   * Verify signature
   */
  static verify(publicKeyBase64, dataToVerify, signatureBase64) {
    try {
      const pemPublicKey = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;

      const verifier = crypto.createVerify('RSA-SHA1');
      verifier.update(dataToVerify, 'utf8');
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');

      return verifier.verify(pemPublicKey, signatureBuffer);
    } catch (error) {
      console.error('RSA Verify Error:', error.message);
      return false;
    }
  }
}
