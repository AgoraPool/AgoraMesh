const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export interface LnurlPayMetadata {
  source: string;
  callback: string;
  minSendable: number;
  maxSendable: number;
  metadata: string;
  allowsNostr: boolean;
  nostrPubkey: string;
}

export interface LnurlInvoice {
  bolt11: string;
  successAction?: unknown;
}

async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const reason = record.reason ?? record.message ?? record.error;
        if (typeof reason === 'string' && reason.trim()) return `${fallback}: ${reason.trim()}`;
      }
    } catch {
      // Plain-text LNURL errors are common enough to surface directly.
    }
    return `${fallback}: ${text.slice(0, 240)}`;
  } catch {
    return fallback;
  }
}

function bech32Polymod(values: number[]): number {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1) {
      if ((top >> index) & 1) checksum ^= generator[index];
    }
  }
  return checksum;
}

function bech32HrpExpand(hrp: string): number[] {
  return [...hrp].map((char) => char.charCodeAt(0) >> 5).concat(0, [...hrp].map((char) => char.charCodeAt(0) & 31));
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = bech32HrpExpand(hrp).concat(data);
  const polymod = bech32Polymod(values.concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const checksum: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    checksum.push((polymod >> (5 * (5 - index))) & 31);
  }
  return checksum;
}

function bech32Decode(value: string): { hrp: string; data: number[] } {
  const normalized = value.toLowerCase();
  const separator = normalized.lastIndexOf('1');
  if (separator <= 0 || separator + 7 > normalized.length) throw new Error('Invalid LNURL bech32 value.');
  const hrp = normalized.slice(0, separator);
  const data = [...normalized.slice(separator + 1)].map((char) => {
    const index = BECH32_CHARSET.indexOf(char);
    if (index === -1) throw new Error('Invalid LNURL bech32 character.');
    return index;
  });
  if (bech32Polymod(bech32HrpExpand(hrp).concat(data)) !== 1) throw new Error('Invalid LNURL checksum.');
  return { hrp, data: data.slice(0, -6) };
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  const maxValue = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) throw new Error('Invalid LNURL data.');
    accumulator = (accumulator << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }
  if (pad) {
    if (bits > 0) result.push((accumulator << (toBits - bits)) & maxValue);
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue)) {
    throw new Error('Invalid LNURL padding.');
  }
  return result;
}

function decodeLnurl(value: string): string {
  const { hrp, data } = bech32Decode(value);
  if (hrp !== 'lnurl') throw new Error('Expected an LNURL value.');
  return new TextDecoder().decode(new Uint8Array(convertBits(data, 5, 8, false)));
}

function encodeLnurl(value: string): string {
  const hrp = 'lnurl';
  const data = convertBits([...new TextEncoder().encode(value)], 8, 5, true);
  return `${hrp}1${data.concat(bech32CreateChecksum(hrp, data)).map((entry) => BECH32_CHARSET[entry]).join('')}`;
}

export function lightningAddressToLnurlEndpoint(address: string): string {
  const parts = address.trim().toLowerCase().split('@');
  const [name, domain] = parts;
  if (parts.length !== 2) throw new Error('Invalid Lightning address.');
  if (!name || !domain || domain.includes('/') || !/^[a-z0-9._-]+$/.test(name)) {
    throw new Error('Invalid Lightning address.');
  }
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

export function resolveLnurlPayUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Lightning address or LNURL is required.');
  if (trimmed.includes('@') && !trimmed.startsWith('http')) return lightningAddressToLnurlEndpoint(trimmed);
  const withoutScheme = trimmed.toLowerCase().startsWith('lightning:') ? trimmed.slice('lightning:'.length) : trimmed;
  if (/^lnurl/i.test(withoutScheme)) return decodeLnurl(withoutScheme);
  if (withoutScheme.startsWith('https://')) return withoutScheme;
  throw new Error('Lightning payment target must be a Lightning address, LNURL, or HTTPS LNURL endpoint.');
}

export function lnurlTagForPayUrl(value: string): string {
  return encodeLnurl(resolveLnurlPayUrl(value)).toLowerCase();
}

function parseLnurlResponse(value: unknown, source: string): LnurlPayMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed LNURL response.');
  const record = value as Record<string, unknown>;
  if (record.status === 'ERROR') throw new Error(String(record.reason ?? 'LNURL service returned an error.'));
  if (record.tag !== 'payRequest') throw new Error('LNURL endpoint is not a pay request.');
  const callback = String(record.callback ?? '');
  const minSendable = Number(record.minSendable);
  const maxSendable = Number(record.maxSendable);
  const metadata = String(record.metadata ?? '');
  const nostrPubkey = String(record.nostrPubkey ?? '').toLowerCase();
  if (!callback.startsWith('https://')) throw new Error('LNURL callback must use HTTPS.');
  if (!Number.isInteger(minSendable) || !Number.isInteger(maxSendable) || minSendable <= 0 || maxSendable < minSendable) {
    throw new Error('LNURL amount bounds are invalid.');
  }
  if (record.allowsNostr !== true || !/^[0-9a-f]{64}$/i.test(nostrPubkey)) {
    throw new Error('LNURL service does not advertise NIP-57 zap receipt support.');
  }
  return {
    source,
    callback,
    minSendable,
    maxSendable,
    metadata,
    allowsNostr: true,
    nostrPubkey
  };
}

export async function fetchLnurlPayMetadata(source: string): Promise<LnurlPayMetadata> {
  const url = resolveLnurlPayUrl(source);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(await responseErrorMessage(response, `LNURL metadata request failed with HTTP ${response.status}.`));
  return parseLnurlResponse(await response.json(), source.trim());
}

export async function requestLnurlInvoice(metadata: LnurlPayMetadata, amountMsats: number, zapRequest: string): Promise<LnurlInvoice> {
  if (!Number.isInteger(amountMsats) || amountMsats < metadata.minSendable || amountMsats > metadata.maxSendable) {
    throw new Error('Amount is outside the LNURL service limits.');
  }
  const url = new URL(metadata.callback);
  url.searchParams.set('amount', String(amountMsats));
  url.searchParams.set('nostr', zapRequest);
  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(await responseErrorMessage(response, `LNURL invoice request failed with HTTP ${response.status}.`));
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Malformed LNURL invoice response.');
  const record = body as Record<string, unknown>;
  if (record.status === 'ERROR') throw new Error(String(record.reason ?? 'LNURL invoice request failed.'));
  const bolt11 = String(record.pr ?? '');
  if (!/^ln(bc|tb|bcrt)/i.test(bolt11)) throw new Error('LNURL service did not return a BOLT11 invoice.');
  return { bolt11, successAction: record.successAction };
}
