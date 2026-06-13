import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLnurlPayMetadata, lightningAddressToLnurlEndpoint, lnurlTagForPayUrl, requestLnurlInvoice, resolveLnurlPayUrl } from './lnurl';

describe('LNURL-pay helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves lightning addresses and rejects insecure targets', () => {
    expect(lightningAddressToLnurlEndpoint('seller@example.com')).toBe('https://example.com/.well-known/lnurlp/seller');
    expect(resolveLnurlPayUrl('lightning:seller@example.com')).toBe('https://example.com/.well-known/lnurlp/seller');
    expect(resolveLnurlPayUrl('https://pay.example/lnurlp/seller')).toBe('https://pay.example/lnurlp/seller');
    const lnurl = lnurlTagForPayUrl('seller@example.com');
    expect(lnurl.startsWith('lnurl1')).toBe(true);
    expect(resolveLnurlPayUrl(lnurl)).toBe('https://example.com/.well-known/lnurlp/seller');
    expect(() => resolveLnurlPayUrl('http://pay.example/lnurlp/seller')).toThrow(/lightning address|https/i);
  });

  it('fetches NIP-57-capable LNURL metadata over HTTPS', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tag: 'payRequest',
        callback: 'https://pay.example/callback',
        minSendable: 1000,
        maxSendable: 1000000,
        metadata: '[]',
        allowsNostr: true,
        nostrPubkey: 'a'.repeat(64)
      })
    } as Response);

    await expect(fetchLnurlPayMetadata('seller@example.com')).resolves.toMatchObject({
      callback: 'https://pay.example/callback',
      minSendable: 1000,
      maxSendable: 1000000,
      nostrPubkey: 'a'.repeat(64)
    });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/.well-known/lnurlp/seller', { headers: { accept: 'application/json' } });
  });

  it('requests invoices with millisats and signed zap request JSON', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ pr: 'lnbc1exampleinvoice' })
    } as Response);

    const invoice = await requestLnurlInvoice(
      {
        source: 'seller@example.com',
        callback: 'https://pay.example/callback',
        minSendable: 1000,
        maxSendable: 1000000,
        metadata: '[]',
        allowsNostr: true,
        nostrPubkey: 'b'.repeat(64)
      },
      21000,
      '{"kind":9734}'
    );

    expect(invoice.bolt11).toBe('lnbc1exampleinvoice');
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.searchParams.get('amount')).toBe('21000');
    expect(requested.searchParams.get('nostr')).toBe('{"kind":9734}');
  });

  it('rejects LNURL services without zap receipt support and out-of-bounds amounts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag: 'payRequest',
        callback: 'https://pay.example/callback',
        minSendable: 1000,
        maxSendable: 2000,
        metadata: '[]',
        allowsNostr: false
      })
    } as Response);

    await expect(fetchLnurlPayMetadata('seller@example.com')).rejects.toThrow(/NIP-57/i);
    await expect(
      requestLnurlInvoice(
        {
          source: 'seller@example.com',
          callback: 'https://pay.example/callback',
          minSendable: 1000,
          maxSendable: 2000,
          metadata: '[]',
          allowsNostr: true,
          nostrPubkey: 'b'.repeat(64)
        },
        3000,
        '{}'
      )
    ).rejects.toThrow(/limits/i);
  });

  it('surfaces LNURL callback error reasons from HTTP 400 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ status: 'ERROR', reason: 'Invalid zap request recipient.' })
    } as Response);

    await expect(
      requestLnurlInvoice(
        {
          source: 'seller@example.com',
          callback: 'https://pay.example/callback',
          minSendable: 1000,
          maxSendable: 2000,
          metadata: '[]',
          allowsNostr: true,
          nostrPubkey: 'b'.repeat(64)
        },
        1000,
        '{}'
      )
    ).rejects.toThrow(/Invalid zap request recipient/);
  });
});
