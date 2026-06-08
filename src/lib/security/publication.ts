const sensitiveFieldNames = new Set([
  'privatekey',
  'encryptedprivatekey',
  'secret',
  'seed',
  'mnemonic',
  'nsec',
  'claimsummary',
  'requestedresolution',
  'response',
  'timeline',
  'evidence',
  'localfilename',
  'filename',
  'filepath',
  'settlementproposal',
  'privatesettlementtext',
  'settlementtext',
  'agreementtext',
  'fullagreement',
  'agreementterms',
  'evidenceexpectations',
  'exchangedescription',
  'priceandpayment',
  'fulfillmentterms',
  'refundterms',
  'paymentsecret',
  'paymentsecrets',
  'walletseed',
  'refundsecret',
  'privateinvoice',
  'privatememo'
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function findSensitivePublicationFields(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findSensitivePublicationFields(entry, `${path}[${index}]`));
  }

  const record = value as Record<string, unknown>;
  const matches: string[] = [];
  for (const [key, child] of Object.entries(record)) {
    const childPath = `${path}.${key}`;
    if (sensitiveFieldNames.has(normalizeKey(key))) {
      matches.push(childPath);
    }
    matches.push(...findSensitivePublicationFields(child, childPath));
  }
  return matches;
}

export function assertPublishablePayload(value: unknown): void {
  const matches = findSensitivePublicationFields(value);
  if (matches.length > 0) {
    throw new Error(`Refusing to publish sensitive fields: ${matches.join(', ')}`);
  }
}
