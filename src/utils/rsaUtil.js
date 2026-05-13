// src/utils/rsaUtil.js
import crypto from 'crypto';

export class RsaUtil {
  /**
   * Generate 2048-bit RSA key pair
   */
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

  /**
   * Sign data - Handles both PEM and Base64 formats
   */
  static sign(privateKeyInput, dataToSign) {
    try {
      let privateKeyBuffer;

      // Handle PEM format (most common when copied from files)
      if (privateKeyInput.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKeyBuffer = privateKeyInput; // PEM format, crypto accepts it directly
      } 
      // Handle Base64 format
      else {
        privateKeyBuffer = Buffer.from(privateKeyInput, 'base64');
      }

      const signer = crypto.createSign('RSA-SHA1');
      signer.update(dataToSign, 'utf8');
      const signature = signer.sign(privateKeyBuffer);

      return signature.toString('base64');
    } catch (error) {
      console.error('RSA Sign Error:', error.message);
      throw new Error('Failed to generate signature. Check your private key format.');
    }
  }

  /**
   * Verify signature
   */
  static verify(publicKeyInput, dataToVerify, signatureBase64) {
    try {
      let publicKeyBuffer;

      if (publicKeyInput.includes('-----BEGIN PUBLIC KEY-----')) {
        publicKeyBuffer = publicKeyInput;
      } else {
        publicKeyBuffer = Buffer.from(publicKeyInput, 'base64');
      }

      const verifier = crypto.createVerify('RSA-SHA1');
      verifier.update(dataToVerify, 'utf8');
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');

      return verifier.verify(publicKeyBuffer, signatureBuffer);
    } catch (error) {
      console.error('RSA Verify Error:', error.message);
      return false;
    }
  }
}
