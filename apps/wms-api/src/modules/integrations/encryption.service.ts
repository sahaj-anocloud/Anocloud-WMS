import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class EncryptionService {
  private key: Buffer;

  constructor(secretKey?: string) {
    // In production, this should be fetched from AWS KMS or AWS Secrets Manager.
    // For local development, we fallback to a deterministic derivation.
    const secret = secretKey || process.env.PII_ENCRYPTION_KEY || 'sumosave-wms-local-dev-secret-key';
    
    // Use scrypt to derive a robust 32-byte key
    this.key = crypto.scryptSync(secret, 'sumosave-salt', KEY_LENGTH);
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Returns a payload in the format IV:AUTH_TAG:CIPHERTEXT
   */
  encrypt(text: string): string {
    if (!text) return text;
    
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts an AES-256-GCM payload in the format IV:AUTH_TAG:CIPHERTEXT
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) return encryptedData;
    
    if (!encryptedData.includes(':')) {
      // It's likely plaintext or corrupted, return as is for backward compatibility
      return encryptedData;
    }
    
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted payload format');
      }
      
      const ivStr = parts[0];
      const tagStr = parts[1];
      const encryptedText = parts[2];

      if (!ivStr || !tagStr || !encryptedText) {
        throw new Error('Invalid encrypted payload components');
      }
      
      const iv = Buffer.from(ivStr, 'hex');
      const tag = Buffer.from(tagStr, 'hex');
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[EncryptionService] Decryption failed:', error);
      throw new Error('Failed to decrypt PII data. Data may be corrupted or key is incorrect.');
    }
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
