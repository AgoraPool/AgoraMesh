import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('documented security promises', () => {
  it('keeps core product promises visible in SECURITY.md', async () => {
    const security = await readFile('SECURITY.md', 'utf8');
    for (const promise of [
      'No custody',
      'No KYC',
      'No automatic publish',
      'No automatic import',
      'No private trade publishing',
      'No decrypted private-key persistence',
      'No synced public record writes into user-owned local records'
    ]) {
      expect(security).toContain(promise);
    }
  });
});
