import { decryptDisputeBundle, encryptDisputeBundle } from './encryptedExport';
import type { DisputeCase } from '../../types/domain';

const dispute: DisputeCase = {
  id: 'dispute_secret',
  state: 'opened',
  agreementHash: 'a'.repeat(64),
  claimant: 'alice',
  respondent: 'bob',
  mediator: 'carol',
  claimSummary: 'Private claim text',
  requestedResolution: 'Private requested resolution',
  response: 'Private response text',
  timeline: [{ id: 'timeline_1', at: '2026-05-31T00:00:00.000Z', note: 'Private timeline note' }],
  evidence: [
    {
      id: 'evidence_1',
      title: 'Private receipt',
      description: 'Sensitive receipt metadata',
      fileHash: 'hash123',
      date: '2026-05-31',
      source: 'local',
      localFilename: 'receipt-private.png',
      notes: 'Private evidence notes'
    }
  ],
  settlementProposal: 'Private settlement',
  outcomeSummary: 'Private outcome',
  publishOutcomeAttestation: false,
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z'
};

describe('encrypted dispute bundles', () => {
  it('round trips a dispute with the correct passphrase', async () => {
    const envelope = await encryptDisputeBundle(dispute, 'correct horse battery staple');
    await expect(decryptDisputeBundle(envelope, 'correct horse battery staple')).resolves.toMatchObject({
      id: 'dispute_secret',
      claimSummary: 'Private claim text'
    });
  });

  it('fails with the wrong passphrase', async () => {
    const envelope = await encryptDisputeBundle(dispute, 'correct horse battery staple');
    await expect(decryptDisputeBundle(envelope, 'wrong horse battery staple')).rejects.toThrow();
  });

  it('does not expose plaintext dispute fields in the encrypted envelope', async () => {
    const envelope = await encryptDisputeBundle(dispute, 'correct horse battery staple');
    const serialized = JSON.stringify(envelope);

    expect(serialized).not.toContain('Private claim text');
    expect(serialized).not.toContain('Private response text');
    expect(serialized).not.toContain('Private receipt');
    expect(serialized).not.toContain('receipt-private.png');
    expect(serialized).not.toContain('Private outcome');
  });
});
