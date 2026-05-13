// src/utils/rsaUtil.js
import crypto from 'crypto';

export class RsaUtil {
  /**
   * Sign data using your Base64 private key
   */
  static sign(privateKeyBase64, dataToSign) {
    try {
      // Convert Base64 to Buffer
      const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');

      const signer = crypto.createSign('RSA-SHA1');
      signer.update(dataToSign, 'utf8');
      
      // Sign with explicit padding
      const signature = signer.sign({
        key: privateKeyBuffer,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      });

      return signature.toString('base64');
    } catch (error) {
      console.error('RSA Sign Error Details:', error.message);
      throw new Error('Failed to generate signature. Please check your private key.');
    }
  }

  /**
   * Verify signature
   */
  static verify(publicKeyBase64, dataToVerify, signatureBase64) {
    try {
      const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');

      const verifier = crypto.createVerify('RSA-SHA1');
      verifier.update(dataToVerify, 'utf8');

      return verifier.verify(publicKeyBuffer, signatureBuffer);
    } catch (error) {
      console.error('RSA Verify Error:', error.message);
      return false;
    }
  }

  // Optional: Generate new keys if needed
  static generateKeyPair() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    return {
      privateKey: privateKey.toString('base64'),
      publicKey: publicKey.toString('base64'),
    };
  }
}
