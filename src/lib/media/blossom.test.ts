import { describe, expect, it } from 'vitest';
import { listingImageFromBlossomResponse, validateListingImageFile } from './blossom';

function imageFile(type = 'image/png', size = 32): File {
  return new File([new Uint8Array(size)], 'local-name-not-persisted.png', { type });
}

describe('Blossom listing media helpers', () => {
  it('validates public listing image files', () => {
    expect(() => validateListingImageFile(imageFile('image/png', 1024))).not.toThrow();
    expect(() => validateListingImageFile(imageFile('image/gif', 1024))).toThrow(/JPEG, PNG, or WebP/i);
    expect(() => validateListingImageFile(imageFile('image/png', 6 * 1024 * 1024))).toThrow(/5 MB/i);
  });

  it('creates listing image metadata from safe Blossom responses', () => {
    const sha256 = '2'.repeat(64);
    expect(
      listingImageFromBlossomResponse(
        {
          url: 'https://media.example/blob.webp',
          sha256,
          mimeType: 'image/webp',
          sizeBytes: 1024,
          width: 640,
          height: 480
        },
        imageFile('image/webp', 1024),
        sha256,
        'https://media.example',
        'Public listing image'
      )
    ).toMatchObject({
      url: 'https://media.example/blob.webp',
      sha256,
      mimeType: 'image/webp',
      altText: 'Public listing image',
      blossomServerUrl: 'https://media.example'
    });
  });

  it('creates listing image metadata from NIP-94 tag responses', () => {
    const sha256 = '5'.repeat(64);
    expect(
      listingImageFromBlossomResponse(
        {
          nip94_event: {
            tags: [
              ['url', 'https://media.example/tagged.webp'],
              ['x', sha256],
              ['m', 'image/webp'],
              ['size', '2048']
            ]
          }
        },
        imageFile('image/webp', 2048),
        sha256,
        'https://media.example/'
      )
    ).toMatchObject({
      url: 'https://media.example/tagged.webp',
      sha256,
      mimeType: 'image/webp',
      sizeBytes: 2048,
      blossomServerUrl: 'https://media.example'
    });
  });

  it('falls back to the Blossom blob URL when the response omits a URL', () => {
    const sha256 = '6'.repeat(64);
    expect(listingImageFromBlossomResponse({ sha256 }, imageFile(), sha256, 'https://media.example')).toMatchObject({
      url: `https://media.example/${sha256}`,
      sha256
    });
  });

  it('resolves relative Blossom response URLs against the configured server', () => {
    const sha256 = '7'.repeat(64);
    expect(listingImageFromBlossomResponse({ url: `/${sha256}`, sha256 }, imageFile(), sha256, 'https://media.example/')).toMatchObject({
      url: `https://media.example/${sha256}`,
      sha256
    });
  });

  it('rejects unsafe Blossom responses', () => {
    const sha256 = '3'.repeat(64);
    expect(() =>
      listingImageFromBlossomResponse({ url: 'http://media.example/blob.png', sha256 }, imageFile(), sha256, 'https://media.example')
    ).toThrow(/https/i);
    expect(() =>
      listingImageFromBlossomResponse({ url: 'https://media.example/blob.png', sha256: '4'.repeat(64) }, imageFile(), sha256, 'https://media.example')
    ).toThrow(/hash/i);
  });
});
