// src/utils/rsaUtil.js
import crypto from 'crypto';

export class RsaUtil {
  /**
   * Generate 2048-bit RSA key pair (matches PalmPay Java SDK)
   */
  static generateKeyPair() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'der',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der',
      },
    });

    return {
      privateKey: privateKey.toString('base64'),
      publicKey: publicKey.toString('base64'),
    };
  }

  /**
   * Sign data using RSA-SHA1 (PalmPay standard)
   */
  static sign(privateKeyBase64, dataToSign) {
    try {
      const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');

      const signer = crypto.createSign('RSA-SHA1');
      signer.update(dataToSign, 'utf8');
      const signature = signer.sign(privateKeyBuffer);

      return signature.toString('base64');
    } catch (error) {
      console.error('RSA Sign Error:', error.message);
      throw new Error('Failed to generate signature');
    }
  }

  /**
   * Verify signature using RSA-SHA1
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
}
