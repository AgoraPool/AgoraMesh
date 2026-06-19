import { bytesToHex } from '@noble/hashes/utils';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectNostrSigner, connectNostrSigner, disconnectNostrSigner, nostrConnectAndroidIntentUri, signWithNostrSigner } from './signer';
import { unsignedAgoraEvent, AGORAMESH_EVENT_KINDS } from './events';

describe('NIP-07 browser signer helpers', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'nostr');
    window.localStorage.clear();
    window.sessionStorage.clear();
    disconnectNostrSigner();
    vi.restoreAllMocks();
  });

  it('detects unavailable signer extensions', () => {
    expect(detectNostrSigner()).toEqual({ available: false, connected: false });
  });

  it('migrates stored Nostr Connect sessions from sessionStorage to localStorage', () => {
    const session = {
      clientSecretHex: '1'.repeat(64),
      clientPubkey: '2'.repeat(64),
      remotePubkey: '3'.repeat(64),
      publicKey: '4'.repeat(64),
      relays: ['wss://relay.example'],
      secret: 'pairing-secret',
      connectedAtMs: 123
    };
    window.sessionStorage.setItem('agoramesh:nip46:session', JSON.stringify(session));

    expect(detectNostrSigner()).toMatchObject({ available: true, connected: false, provider: 'nip46', connectedAtMs: 123 });
    expect(window.localStorage.getItem('agoramesh:nip46:session')).toBe(JSON.stringify(session));
    expect(window.sessionStorage.getItem('agoramesh:nip46:session')).toBeNull();
  });

  it('disconnects and clears stored Amber session and pending pairing data', () => {
    window.localStorage.setItem('agoramesh:nip46:session', '{"stored":true}');
    window.localStorage.setItem('agoramesh:nip46:pending', '{"pending":true}');
    window.sessionStorage.setItem('agoramesh:nip07:connected', '{"publicKey":"' + 'a'.repeat(64) + '","connectedAtMs":123}');

    expect(disconnectNostrSigner()).toEqual({ available: false, connected: false });
    expect(window.localStorage.getItem('agoramesh:nip46:session')).toBeNull();
    expect(window.localStorage.getItem('agoramesh:nip46:pending')).toBeNull();
    expect(window.sessionStorage.getItem('agoramesh:nip07:connected')).toBeNull();
  });

  it('builds Android intent links for Amber Nostr Connect handoff', () => {
    expect(nostrConnectAndroidIntentUri('nostrconnect://abc123?relay=wss%3A%2F%2Frelay.example&secret=pair')).toBe(
      'intent://abc123?relay=wss%3A%2F%2Frelay.example&secret=pair#Intent;scheme=nostrconnect;package=com.greenart7c3.nostrsigner;end'
    );
    expect(nostrConnectAndroidIntentUri('https://example.com')).toBeUndefined();
  });

  it('connects to an available signer public key', async () => {
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn()
      }
    });

    await expect(connectNostrSigner()).resolves.toMatchObject({
      available: true,
      connected: true,
      publicKey: 'a'.repeat(64)
    });
  });

  it('reports signer connect failures', async () => {
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn().mockRejectedValue(new Error('denied')),
        signEvent: vi.fn()
      }
    });

    await expect(connectNostrSigner()).resolves.toMatchObject({
      available: true,
      connected: false,
      lastError: 'denied'
    });
  });

  it('signs with the extension and rejects pubkey mismatches', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const unsigned = unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.profile, [['d', 'profile_1']], {
      id: 'profile_1',
      publicKey,
      displayName: 'Signer',
      avatarUrl: '',
      bio: '',
      region: '',
      languages: ['en'],
      contactMethods: [],
      skills: [],
      mediatorAvailable: false,
      publicVisibility: true,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn().mockResolvedValue(publicKey),
        signEvent: vi.fn().mockImplementation((event) => finalizeEvent(event, privateKey))
      }
    });

    await expect(signWithNostrSigner(unsigned, publicKey)).resolves.toMatchObject({ pubkey: publicKey });
    await expect(signWithNostrSigner(unsigned, bytesToHex(generateSecretKey()).slice(0, 64))).rejects.toThrow(/does not match/i);
  });

  it('surfaces signing rejection', async () => {
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn(),
        signEvent: vi.fn().mockRejectedValue(new Error('user rejected'))
      }
    });

    await expect(signWithNostrSigner(unsignedAgoraEvent(1, [], {}), 'a'.repeat(64))).rejects.toThrow(/user rejected/i);
  });

  it('rejects signer responses that modify the unsigned content', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const unsigned = unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.profile, [['d', 'profile_1']], { id: 'profile_1' });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn(),
        signEvent: vi.fn().mockImplementation((event) => finalizeEvent({ ...event, content: '{"changed":true}' }, privateKey))
      }
    });

    await expect(signWithNostrSigner(unsigned, publicKey)).rejects.toThrow(/modified/i);
  });

  it('rejects signer responses that modify the unsigned kind', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const unsigned = unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.profile, [['d', 'profile_1']], { id: 'profile_1' });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn(),
        signEvent: vi.fn().mockImplementation((event) => finalizeEvent({ ...event, kind: event.kind + 1 }, privateKey))
      }
    });

    await expect(signWithNostrSigner(unsigned, publicKey)).rejects.toThrow(/modified/i);
  });

  it('rejects signer responses that modify the unsigned tags', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const unsigned = unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.profile, [['d', 'profile_1']], { id: 'profile_1' });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn(),
        signEvent: vi.fn().mockImplementation((event) => finalizeEvent({ ...event, tags: [...event.tags, ['extra', 'tag']] }, privateKey))
      }
    });

    await expect(signWithNostrSigner(unsigned, publicKey)).rejects.toThrow(/modified/i);
  });

  it('rejects signer responses that modify the unsigned timestamp', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const unsigned = unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.profile, [['d', 'profile_1']], { id: 'profile_1' });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn(),
        signEvent: vi.fn().mockImplementation((event) => finalizeEvent({ ...event, created_at: event.created_at + 1 }, privateKey))
      }
    });

    await expect(signWithNostrSigner(unsigned, publicKey)).rejects.toThrow(/modified/i);
  });

  it('rejects signer responses with invalid signatures', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const unsigned = unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.profile, [['d', 'profile_1']], { id: 'profile_1' });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn(),
        signEvent: vi.fn().mockImplementation((event) => ({ ...finalizeEvent(event, privateKey), sig: '0'.repeat(128) }))
      }
    });

    await expect(signWithNostrSigner(unsigned, publicKey)).rejects.toThrow(/invalid/i);
  });
});
