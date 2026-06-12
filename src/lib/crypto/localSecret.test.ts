import { describe, expect, it } from 'vitest';
import { decryptLocalSecret, encryptLocalSecret } from './localSecret';

describe('local encrypted secret cache', () => {
  it('round-trips plaintext with the correct passphrase', async () => {
    const secret = await encryptLocalSecret('private inbox body', 'correct horse battery');

    expect(secret.ciphertext).not.toContain('private inbox body');
    await expect(decryptLocalSecret(secret, 'correct horse battery')).resolves.toBe('private inbox body');
  });

  it('rejects a wrong passphrase', async () => {
    const secret = await encryptLocalSecret('private inbox body', 'correct horse battery');

    await expect(decryptLocalSecret(secret, 'wrong horse battery')).rejects.toThrow();
  });
});
