import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { EncryptionService } from './encryption.service';

describe('EncryptionService (AES-256-GCM)', () => {
  const service = new EncryptionService('test-encryption-key');

  it('should encrypt and decrypt a static string', () => {
    const pii = '27AABCT0000Z1Z1'; // Example GSTIN
    const encrypted = service.encrypt(pii);
    
    expect(encrypted).not.toBe(pii);
    expect(encrypted.split(':').length).toBe(3); // IV:TAG:CIPHERTEXT
    
    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(pii);
  });

  it('should produce different ciphertexts for the same plaintext due to random IVs', () => {
    const pii = 'SensitiveData123';
    const encrypted1 = service.encrypt(pii);
    const encrypted2 = service.encrypt(pii);
    
    expect(encrypted1).not.toBe(encrypted2);
    expect(service.decrypt(encrypted1)).toBe(pii);
    expect(service.decrypt(encrypted2)).toBe(pii);
  });

  it('should throw an error on tampering with the ciphertext', () => {
    const encrypted = service.encrypt('TopSecret');
    const parts = encrypted.split(':');
    
    // Tamper with the ciphertext (parts[2])
    if (parts[2]) {
      const tampered = `${parts[0]}:${parts[1]}:deadbeef${parts[2].substring(8)}`;
      expect(() => service.decrypt(tampered)).toThrow('Failed to decrypt PII data. Data may be corrupted or key is incorrect.');
    }
  });

  it('should return empty string if empty string is provided', () => {
    expect(service.encrypt('')).toBe('');
    expect(service.decrypt('')).toBe('');
  });

  it('should return original text if decryption is attempted on unencrypted (no colons) backward-compatible data', () => {
    expect(service.decrypt('PlaintextData')).toBe('PlaintextData');
  });

  // Property-based test: Any arbitrary string can be encrypted and decrypted perfectly
  it('Property: Encryption and decryption are perfectly inverse operations for any string', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const encrypted = service.encrypt(text);
        const decrypted = service.decrypt(encrypted);
        return decrypted === text;
      }),
      { numRuns: 100 }
    );
  });
});
