import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { db, deleteLocalData } from '../lib/storage/db';
import { App } from './App';
import type { Agreement, BuyerRequestOffer, DisputeCase, IdentityRecord, Listing, MediatorProfile, NostrReviewItem, PublicProfile, RelayHealth, SyncedPublicRecord } from '../types/domain';

function renderAppAt(hash: string): void {
  window.location.hash = hash;
  render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}

function listingFixture(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'listing_fixture',
    authorPublicKey: 'c'.repeat(64),
    title: 'Public repair help',
    type: 'offer',
    category: 'repairs',
    description: 'Repair help available.',
    region: 'Brno',
    status: 'active',
    price: { amount: '0', currency: 'FREE' },
    paymentPreferences: ['cash'],
    barterAccepted: false,
    tags: ['tools'],
    expiresAt: '2026-06-30',
    contactMethod: { id: 'contact_public', kind: 'matrix', value: '@repair:matrix.org' },
    visibility: 'public',
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    ...overrides
  };
}

function rawListingEventFixture({ id, pubkey, createdAt, title }: { id: string; pubkey: string; createdAt: number; title: string }): string {
  return JSON.stringify({
    id,
    pubkey,
    created_at: createdAt,
    kind: 30402,
    tags: [['d', 'listing_fixture']],
    content: title,
    sig: 'f'.repeat(128)
  });
}

function identityFixture(): IdentityRecord {
  return {
    id: 'identity_1',
    displayName: 'alice',
    publicKey: 'a'.repeat(64),
    encryptedPrivateKey: {
      ciphertext: 'encrypted',
      iv: 'iv',
      salt: 'salt',
      iterations: 210000,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256'
    },
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z'
  };
}

describe('production readiness UI', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('agoramesh.marketplace.prefetchedNative.v1', 'done');
    await deleteLocalData();
    URL.createObjectURL = vi.fn((_object: Blob | MediaSource) => 'blob:agoramesh-test');
    URL.revokeObjectURL = vi.fn((_url: string) => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'nostr');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('references the shipped app icon for browser chrome', () => {
    const html = readFileSync('index.html', 'utf8');

    expect(html).toContain('href="/icons/icon.svg"');
    expect(existsSync('public/icons/icon.svg')).toBe(true);
  });

  it('exposes skip navigation, page landmarks, and active navigation state', async () => {
    renderAppAt('#browse');

    expect(await screen.findByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main', { name: 'Marketplace' })).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Secondary navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    expect(document.querySelector('.app-sidebar .brand-mark')).toHaveAttribute('src', '/icons/icon.svg');
    expect(screen.getByRole('button', { name: 'Marketplace' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marketplace mobile tab' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Mediators mobile tab' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse mediators' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language selector' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Mobile language selector' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Post' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Marketplace' }));
    expect(screen.getByRole('button', { name: 'Marketplace' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Post' })).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const shell = document.querySelector('.app-shell') as HTMLElement;
    expect(shell).toHaveClass('sidebar-collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('labels tablists, supports keyboard tab switching, and connects disclosures to their panels', async () => {
    renderAppAt('#browse');

    expect(await screen.findByRole('tablist', { name: 'Marketplace' })).toBeInTheDocument();
    const discoverTab = screen.getByRole('tab', { name: 'Discover' });
    expect(discoverTab).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(discoverTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    const filters = screen.getByRole('button', { name: 'More filters' });
    expect(filters).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(filters);
    expect(filters).toHaveAttribute('aria-expanded', 'true');
    const panelId = filters.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('tablist', { name: 'Settings' })).toBeInTheDocument();
  });

  it('shows the minimal landing page without setup status clutter', async () => {
    renderAppAt('#home');

    expect(await screen.findByRole('heading', { name: 'AgoraMesh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse Marketplace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create listing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use existing Nostr account' })).toBeInTheDocument();
    expect(screen.getByText(/No custody, no KYC/i)).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'AgoraMesh marketplace flow' })).toBeInTheDocument();
    expect(screen.getByText('A client-side marketplace that separates public discovery from private coordination.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Setup status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create your identity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public Nostr marketplace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Private trade workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Payments and reputation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Self-hostable and local-first' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'FAQ' })).not.toBeInTheDocument();

    const securityModel = screen.getByRole('button', { name: /Security model/ });
    expect(securityModel).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(securityModel);
    expect(securityModel).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'What stays local' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What can be public' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Signer and keys' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Release verification' })).toBeInTheDocument();
  });

  it('renders guided empty states for blank production workflows', async () => {
    renderAppAt('#settings');

    fireEvent.click(await screen.findByRole('tab', { name: 'Diagnostics' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Advanced review diagnostics' }));
    expect(await screen.findByText('Advanced review diagnostics are empty')).toBeInTheDocument();
    expect(screen.getByText('Advanced review diagnostics are empty').closest('.empty-state')).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Trust lists' }));
    expect(screen.getByText('No trusted keys saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish receipts' }));
    expect(screen.getByText('No publish receipts yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trade' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Dispute' }));
    expect(await screen.findByText('No trade agreements yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reputation' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Browse' }));
    expect(await screen.findByText('No reviews in this view')).toBeInTheDocument();
  });

  it('shows optional browser signer status and connects when an extension is available', async () => {
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn().mockResolvedValue('e'.repeat(64)),
        signEvent: vi.fn()
      }
    });

    renderAppAt('#settings');

    fireEvent.click(await screen.findByRole('tab', { name: 'Account & signer' }));
    expect(await screen.findByText('Signer available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect signer' }));
    expect(await screen.findByText('Signer connected.')).toBeInTheDocument();
    expect(screen.getByText('e'.repeat(64))).toBeInTheDocument();
  });

  it('allows signer connection retry when the extension appears after initial detection', async () => {
    renderAppAt('#settings');

    fireEvent.click(await screen.findByRole('tab', { name: 'Account & signer' }));
    expect(await screen.findByText('Signer unavailable')).toBeInTheDocument();

    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn().mockResolvedValue('f'.repeat(64)),
        signEvent: vi.fn()
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect signer' }));

    expect(await screen.findByText('Signer connected.')).toBeInTheDocument();
    expect(screen.getByText('f'.repeat(64))).toBeInTheDocument();
  });

  it('shows reputation workflow tabs and clearer settings sections', async () => {
    renderAppAt('#reputation');

    expect(await screen.findByRole('tablist', { name: 'Marketplace reviews' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Write review' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Browse reviews' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Seller trust' })).toBeInTheDocument();
    expect(screen.getByText(/Write and browse signed public marketplace reviews/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save signed review' })).toBeDisabled();
    expect(screen.getByText('Create an identity before using this action.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('tab', { name: 'Account & signer' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Relays & sync' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Public cache' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trust lists' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Media servers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Backup & danger' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Diagnostics' })).toBeInTheDocument();
  });

  it('routes legacy agreement and dispute hashes into the trade workspace', async () => {
    renderAppAt('#agreements');

    expect(await screen.findByRole('main', { name: 'Trade' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Agreement' })).toHaveAttribute('aria-selected', 'true');
  });

  it('uses signed receipt controls instead of local acceptance checkboxes', async () => {
    await db.listings.put(listingFixture({ id: 'listing_trade_receipts', title: 'Receipt-backed trade' }));
    await db.agreements.put({
      id: 'agreement_receipts',
      buyer: 'alice',
      seller: 'bob',
      buyerPublicKey: 'a'.repeat(64),
      sellerPublicKey: 'c'.repeat(64),
      buyerLabel: 'alice',
      sellerLabel: 'bob',
      listingId: 'listing_trade_receipts',
      exchangeDescription: 'Receipt-backed trade',
      priceAndPayment: 'cash',
      fulfillmentTerms: 'meet in public',
      deadline: '2026-06-30',
      refundTerms: 'refund if not fulfilled',
      mediator: '',
      evidenceExpectations: 'receipts',
      buyerAccepted: true,
      sellerAccepted: true,
      hashVersion: 2,
      hash: 'b'.repeat(64),
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    });

    renderAppAt('#trade');

    expect(await screen.findByLabelText('Buyer public key')).toBeInTheDocument();
    expect(screen.getByLabelText('Seller public key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Buyer/requester accepts')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Seller/provider accepts')).not.toBeInTheDocument();
    expect(screen.getByText('Agreement exchange')).toBeInTheDocument();
    expect(screen.getByText('Prepare terms')).toBeInTheDocument();
    expect(screen.getByText('Share packet')).toBeInTheDocument();
    expect(screen.getByText('Sign receipts')).toBeInTheDocument();
    expect(screen.getByText(/Missing receipts/i)).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/Public keys are intended signers only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign as buyer' })).toHaveAttribute('title', 'Connect a browser signer or create a local identity before signing.');
    expect(screen.getByRole('button', { name: 'Sign as seller' })).toHaveAttribute('title', 'Connect a browser signer or create a local identity before signing.');
  });

  it('shows safety copy for publishing, identity backup, and advanced review diagnostics', async () => {
    renderAppAt('#listing');

    expect(await screen.findByRole('main', { name: 'Marketplace' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByPlaceholderText('Example: Repair help for bicycles')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Backup' }));
    expect(await screen.findByText(/Losing the key means losing the identity/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Relays & sync' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Why this matters' }));
    expect(screen.getByText(/Live sync and manual fetch contact relays directly/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advanced review diagnostics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.click(screen.getByRole('button', { name: 'Why this matters' }));
    expect(screen.getByText(/This advanced queue is for diagnostics/i)).toBeInTheDocument();
  });

  it('hides advanced browse filters until requested', async () => {
    renderAppAt('#browse');

    expect(await screen.findByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Create a public-ready listing')).not.toBeInTheDocument();
    expect(screen.queryByText('Filter presets')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 0 of 0/i)).toBeInTheDocument();
    expect(await screen.findByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create listing' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Listing fetch scope' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AgoraMesh only' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All NIP-99' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Fetch listings' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quick fulfillment filters')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quick payment filters')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));

    expect(screen.getByText('Filter presets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fresh market' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trusted synced' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Moderation view' })).toBeInTheDocument();
    expect(screen.getByText('No advanced filters active')).toBeInTheDocument();
    expect(screen.getByText('Listing fields')).toBeInTheDocument();
    expect(screen.getByText('Source and visibility')).toBeInTheDocument();
    expect(screen.getByText('Curation')).toBeInTheDocument();
    expect(screen.getByText('Maintenance and help')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quick fulfillment filters')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quick payment filters')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Data source')).toBeInTheDocument();
    expect(screen.getByLabelText('Visibility')).toBeInTheDocument();
    expect(screen.getByLabelText('Show expired listings')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'repairs' } });
    expect(screen.getByText('1 active advanced filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Local only' }));
    expect(screen.getByLabelText('Data source')).toHaveValue('local');
    expect(screen.getByText('1 active advanced filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Moderation view' }));
    expect(screen.getByLabelText('Data source')).toHaveValue('synced');
    expect(screen.getByLabelText('Visibility')).toHaveValue('all');
    expect(screen.getByLabelText('Show expired listings')).toBeChecked();
    expect(screen.getByText(/3 active advanced filters/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset advanced filters' }));
    expect(screen.getByText('No advanced filters active')).toBeInTheDocument();
  });

  it('uses the Marketplace scope switch for displayed synced listings', async () => {
    const nativeListing = listingFixture({ id: 'native_scope_listing', title: 'Native AgoraMesh listing', authorPublicKey: 'd'.repeat(64) });
    const broadListing = listingFixture({ id: 'broad_scope_listing', title: 'Broad NIP-99 listing', authorPublicKey: 'e'.repeat(64), tags: ['shopstr'] });
    await db.syncedListings.bulkPut([
      {
        id: 'synced_native_scope',
        eventId: 'event_native_scope',
        kind: 30402,
        authorPublicKey: nativeListing.authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-05-31T00:00:00.000Z',
        importedAt: '2026-05-31T00:00:00.000Z',
        payload: nativeListing,
        trusted: false,
        hidden: false,
        discoveryScope: 'agoramesh-native'
      },
      {
        id: 'synced_broad_scope',
        eventId: 'event_broad_scope',
        kind: 30402,
        authorPublicKey: broadListing.authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-05-31T00:00:00.000Z',
        importedAt: '2026-05-31T00:00:00.000Z',
        payload: broadListing,
        trusted: false,
        hidden: false,
        discoveryScope: 'all-nip99'
      }
    ]);

    renderAppAt('#browse');

    expect(await screen.findByText('Native AgoraMesh listing')).toBeInTheDocument();
    expect(screen.queryByText('Broad NIP-99 listing')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All NIP-99' }));

    expect(await screen.findByText('Broad NIP-99 listing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All NIP-99' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () => expect((await db.syncSettings.get('default'))?.listingDiscoveryScope).toBe('all-nip99'));
  });

  it('uses the newest cached replacement listing and does not show stale active copies', async () => {
    const authorPublicKey = 'd'.repeat(64);
    const oldListing = listingFixture({
      id: 'replacement_listing',
      title: 'Old cached listing title',
      authorPublicKey,
      updatedAt: '2026-06-01T00:00:00.000Z'
    });
    const newListing = listingFixture({
      ...oldListing,
      title: 'Updated cached listing title',
      updatedAt: '2026-06-02T00:00:00.000Z'
    });
    await db.syncedListings.bulkPut([
      {
        id: 'synced_old_replacement',
        eventId: 'event_old_replacement',
        kind: 30402,
        authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-06-01T00:00:00.000Z',
        importedAt: '2026-06-01T00:00:00.000Z',
        payload: oldListing,
        trusted: false,
        hidden: false,
        rawEvent: rawListingEventFixture({ id: 'event_old_replacement', pubkey: authorPublicKey, createdAt: 100, title: oldListing.title }),
        discoveryScope: 'agoramesh-native'
      },
      {
        id: 'synced_new_replacement',
        eventId: 'event_new_replacement',
        kind: 30402,
        authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-06-02T00:00:00.000Z',
        importedAt: '2026-06-02T00:00:00.000Z',
        payload: newListing,
        trusted: false,
        hidden: false,
        rawEvent: rawListingEventFixture({ id: 'event_new_replacement', pubkey: authorPublicKey, createdAt: 200, title: newListing.title }),
        discoveryScope: 'agoramesh-native'
      }
    ]);

    renderAppAt('#browse');

    expect(await screen.findByText('Updated cached listing title')).toBeInTheDocument();
    expect(screen.queryByText('Old cached listing title')).not.toBeInTheDocument();
  });

  it('removes stale active cached listings when the newest replacement is deleted', async () => {
    const authorPublicKey = 'e'.repeat(64);
    const activeListing = listingFixture({
      id: 'deleted_replacement_listing',
      title: 'Listing deleted on relay',
      authorPublicKey,
      status: 'active',
      updatedAt: '2026-06-01T00:00:00.000Z'
    });
    const deletedListing = {
      ...activeListing,
      status: 'deleted' as const,
      updatedAt: '2026-06-02T00:00:00.000Z'
    };
    await db.syncedListings.bulkPut([
      {
        id: 'synced_active_before_delete',
        eventId: 'event_active_before_delete',
        kind: 30402,
        authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-06-01T00:00:00.000Z',
        importedAt: '2026-06-01T00:00:00.000Z',
        payload: activeListing,
        trusted: false,
        hidden: false,
        rawEvent: rawListingEventFixture({ id: 'event_active_before_delete', pubkey: authorPublicKey, createdAt: 100, title: activeListing.title }),
        discoveryScope: 'agoramesh-native'
      },
      {
        id: 'synced_deleted_replacement',
        eventId: 'event_deleted_replacement',
        kind: 30402,
        authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-06-02T00:00:00.000Z',
        importedAt: '2026-06-02T00:00:00.000Z',
        payload: deletedListing,
        trusted: false,
        hidden: false,
        rawEvent: rawListingEventFixture({ id: 'event_deleted_replacement', pubkey: authorPublicKey, createdAt: 200, title: deletedListing.title }),
        discoveryScope: 'agoramesh-native'
      }
    ]);

    renderAppAt('#browse');

    expect(await screen.findByText('No listings match this view')).toBeInTheDocument();
    expect(screen.queryByText('Listing deleted on relay')).not.toBeInTheDocument();
  });

  it('hides expired listings by default and can show them on demand', async () => {
    await db.listings.bulkPut([
      listingFixture({ id: 'active_listing', title: 'Active listing', expiresAt: '2099-06-30' }),
      listingFixture({ id: 'expired_listing', title: 'Expired listing', expiresAt: '2020-06-30' })
    ]);

    renderAppAt('#browse');

    expect(await screen.findByText('Active listing')).toBeInTheDocument();
    expect(screen.queryByText('Expired listing')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 1/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.click(screen.getByLabelText('Show expired listings'));

    expect(await screen.findByText('Expired listing')).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/i)).toBeInTheDocument();
  });

  it('loads busy marketplace results incrementally and resets filters', async () => {
    await db.listings.bulkPut(
      Array.from({ length: 30 }, (_, index) =>
        listingFixture({
          id: `listing_many_${index}`,
          title: `Bulk listing ${index}`,
          expiresAt: '2099-06-30',
          createdAt: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`
        })
      )
    );

    renderAppAt('#browse');

    expect(await screen.findByText('Bulk listing 29')).toBeInTheDocument();
    expect(screen.queryByText('Bulk listing 0')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 24 of 30/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show more records' }));
    expect(await screen.findByText('Bulk listing 0')).toBeInTheDocument();
    expect(screen.getByText(/Showing 30 of 30/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Bulk listing 29' } });
    expect(await screen.findByText(/Showing 1 of 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText(/Showing 24 of 30/i)).toBeInTheDocument();
  });

  it('keeps public listing loading in one discovery panel', async () => {
    await db.listings.put(listingFixture());
    await db.relays.clear();
    await db.relays.bulkPut([{ url: 'wss://disabled.example', enabled: false }]);

    renderAppAt('#browse');

    expect(await screen.findByText('Load public listings')).toBeInTheDocument();
    expect(screen.getByText('0 relays enabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch listings' })).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'More filters' }));
    expect(await screen.findByText('Maintenance and help')).toBeInTheDocument();
    expect(screen.getByLabelText('Marketplace status')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Fetch listings' })).toHaveLength(1);
  });

  it('keeps the direct fetch summary in the discovery panel', async () => {
    await db.listings.put(listingFixture());
    await db.nostrReview.put({
      id: 'review_pending',
      eventId: 'event_pending',
      kind: 30402,
      relay: 'wss://relay.example',
      authorPublicKey: 'b'.repeat(64),
      receivedAt: '2026-05-31T00:00:00.000Z',
      signatureValid: true,
      importStatus: 'pending',
      payloadPreview: 'Pending listing',
      rawEvent: '{}'
    });

    renderAppAt('#browse');

    expect(await screen.findByText('Load public listings')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Listing fetch scope' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch listings' })).toBeInTheDocument();
  });

  it('prefetches AgoraMesh-native starter listings once on first Marketplace entry', async () => {
    localStorage.removeItem('agoramesh.marketplace.prefetchedNative.v1');
    const sentMessages: string[] = [];
    class FakeWebSocket {
      static instances: FakeWebSocket[] = [];
      onopen: (() => void) | undefined;
      onmessage: ((message: { data: string }) => void) | undefined;
      onerror: (() => void) | undefined;
      url: string;

      constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
        window.setTimeout(() => this.onopen?.(), 0);
      }

      send(message: string): void {
        sentMessages.push(message);
        const parsed = JSON.parse(message) as [string, string, ...unknown[]];
        window.setTimeout(() => this.onmessage?.({ data: JSON.stringify(['EOSE', parsed[1]]) }), 0);
      }

      close(): void {
        // Test socket closes synchronously.
      }
    }
    vi.stubGlobal('WebSocket', FakeWebSocket);

    renderAppAt('#browse');

    expect(await screen.findByText(/Starter fetch: 0 imported, 0 updated, 0 unchanged from 2 relays/i)).toBeInTheDocument();
    expect(localStorage.getItem('agoramesh.marketplace.prefetchedNative.v1')).toBe('done');
    expect(sentMessages.join('\n')).toContain('"#t":["agoramesh"]');
    expect(sentMessages.join('\n')).toContain('"#client":["agoramesh"]');

    cleanup();
    renderAppAt('#profile');
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('keeps published listing guidance out of the normal Browse surface', async () => {
    const listing = listingFixture();
    const syncedListing = listingFixture({ id: 'listing_synced_ready', authorPublicKey: 'd'.repeat(64), title: 'Synced ready listing' });
    await db.listings.put(listing);
    await db.syncedListings.put({
      id: 'synced_ready',
      eventId: 'event_ready',
      kind: 30402,
      authorPublicKey: syncedListing.authorPublicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: syncedListing,
      trusted: false,
      hidden: false
    });

    renderAppAt('#browse');

    expect(await screen.findByText('Synced ready listing')).toBeInTheDocument();
    expect(screen.queryByText('Publish your listing when ready')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'My listings' }));
    expect(await screen.findByRole('tab', { name: 'My listings' })).toHaveAttribute('aria-selected', 'true');
  });

  it('creates local community curation lists from visible marketplace records', async () => {
    const identity: IdentityRecord = {
      id: 'identity_1',
      displayName: 'alice',
      publicKey: 'a'.repeat(64),
      encryptedPrivateKey: {
        ciphertext: 'encrypted',
        iv: 'iv',
        salt: 'salt',
        iterations: 210000,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA-256'
      },
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.identity.put(identity);
    await db.listings.put(listingFixture({ expiresAt: '2099-06-30' }));

    renderAppAt('#browse');

    fireEvent.click(await screen.findByRole('button', { name: 'More filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Community curation lists' }));
    fireEvent.change(screen.getByLabelText('List title'), { target: { value: 'Repair picks' } });
    fireEvent.change(screen.getByLabelText('List description'), { target: { value: 'Useful repair listings.' } });
    fireEvent.click(screen.getByLabelText(/Public repair help · Repairs · Local/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save curation list' }));

    expect(await screen.findByText('Community curation list saved locally.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.communityLists.count()).toBe(1));
  });

  it('shows workflow hints and action-specific next steps after creating an identity', async () => {
    renderAppAt('#profile');

    expect(await screen.findByText('Use existing Nostr account')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate new identity' }));
    expect(screen.getByPlaceholderText('Example: Agora gardener')).toBeInTheDocument();
    expect(screen.getByText(/AgoraMesh cannot recover it/i)).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('Display name')[1], { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'correct horse battery staple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create encrypted identity' }));

    expect(await screen.findByText('Encrypted identity saved locally.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Next step' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create listing' })).toBeInTheDocument();
  });

  it('connects an existing Nostr account without storing private key material', async () => {
    const publicKey = 'b'.repeat(64);
    const syncedProfile: PublicProfile = {
      id: 'profile_existing',
      displayName: 'Published Alice',
      publicKey,
      avatarUrl: 'https://example.com/alice.png',
      bio: 'Existing public profile',
      region: 'Prague',
      languages: ['en', 'cs'],
      contactMethods: [{ id: 'contact_existing', kind: 'matrix', value: '@alice:matrix.org' }],
      skills: ['repairs'],
      mediatorAvailable: false,
      publicVisibility: true,
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const syncedListing = listingFixture({
      id: 'owned_synced_listing',
      authorPublicKey: publicKey,
      title: 'Owned published listing',
      updatedAt: '2026-05-31T00:00:00.000Z'
    });
    const syncedMediator: MediatorProfile = {
      id: 'mediator_existing',
      displayName: 'Published Alice',
      publicKey,
      region: 'Prague',
      languages: ['en', 'cs'],
      specialties: ['repairs'],
      feeModel: 'Sliding fee',
      mediationStyle: 'Written process',
      responseTime: '24 hours',
      caseCount: 0,
      contactMethods: [{ id: 'contact_existing', kind: 'matrix', value: '@alice:matrix.org' }],
      procedure: 'Collect statements and signed receipts.',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.syncedProfiles.put({
      id: 'synced_profile_existing',
      eventId: 'event_profile_existing',
      kind: 39001,
      authorPublicKey: publicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      trusted: true,
      hidden: false,
      payload: syncedProfile
    });
    await db.syncedListings.put({
      id: 'synced_owned_listing',
      eventId: 'event_owned_listing',
      kind: 30402,
      authorPublicKey: publicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      trusted: true,
      hidden: false,
      payload: syncedListing,
      discoveryScope: 'agoramesh-native'
    });
    await db.syncedMediators.put({
      id: 'synced_owned_mediator',
      eventId: 'event_owned_mediator',
      kind: 39003,
      authorPublicKey: publicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      trusted: true,
      hidden: false,
      payload: syncedMediator
    });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn().mockResolvedValue(publicKey),
        signEvent: vi.fn()
      }
    });

    renderAppAt('#profile');

    fireEvent.change((await screen.findAllByLabelText('Display name'))[0], { target: { value: 'Existing Nostr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use existing Nostr account' }));

    expect(await screen.findByText('Existing Nostr account connected and 3 authored public record(s) restored locally for editing.')).toBeInTheDocument();
    await waitFor(async () => {
      const identity = await db.identity.toCollection().first();
      expect(identity).toMatchObject({ publicKey, keySource: 'nostr-extension', displayName: 'Published Alice' });
      expect(JSON.stringify(identity)).not.toContain('encryptedPrivateKey');
    });
    await expect(db.profile.toCollection().first()).resolves.toMatchObject({
      displayName: 'Published Alice',
      publicKey,
      bio: 'Existing public profile'
    });
    await expect(db.listings.get('owned_synced_listing')).resolves.toMatchObject({ id: 'owned_synced_listing', authorPublicKey: publicKey });
    await expect(db.mediators.get('mediator_existing')).resolves.toMatchObject({ id: 'mediator_existing', publicKey });
    await expect(db.publishReceipts.count()).resolves.toBe(0);
    expect(await screen.findByDisplayValue('Published Alice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Public profile' }));
    expect(screen.getByDisplayValue('Existing public profile')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock for signing' })).not.toBeInTheDocument();

    cleanup();
    renderAppAt('#listing/local/owned_synced_listing');
    expect(await screen.findByRole('heading', { name: 'Owned published listing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit listing' })).toBeInTheDocument();
  });

  it('does not create a mediator profile when mediator availability is unchecked', async () => {
    await db.identity.put(identityFixture());

    renderAppAt('#profile');

    fireEvent.click(await screen.findByRole('tab', { name: 'Public profile' }));
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Public repair profile' } });
    fireEvent.change(screen.getByLabelText('Approximate region'), { target: { value: 'Prague' } });
    fireEvent.change(screen.getByLabelText('Languages'), { target: { value: 'en, cs' } });
    fireEvent.change(screen.getByLabelText('Skills/interests'), { target: { value: 'repairs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Profile saved locally.')).toBeInTheDocument();
    await expect(db.profile.toCollection().first()).resolves.toMatchObject({ mediatorAvailable: false });
    await expect(db.mediators.count()).resolves.toBe(0);
  });

  it('creates and updates one local mediator profile from a mediator-enabled marketplace profile', async () => {
    const identity = identityFixture();
    await db.identity.put(identity);

    renderAppAt('#profile');

    fireEvent.click(await screen.findByRole('tab', { name: 'Public profile' }));
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Public mediator profile' } });
    fireEvent.change(screen.getByLabelText('Approximate region'), { target: { value: 'Brno' } });
    fireEvent.change(screen.getByLabelText('Languages'), { target: { value: 'en, cs' } });
    fireEvent.change(screen.getByLabelText('Skills/interests'), { target: { value: 'mediation, repairs' } });
    fireEvent.change(screen.getAllByLabelText('Contact methods')[1], { target: { value: '@alice:matrix.org' } });
    fireEvent.click(screen.getByLabelText('Available as mediator'));
    expect(await screen.findByText('Mediator marketplace profile')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Specialties'), { target: { value: 'marketplace disputes, repairs' } });
    fireEvent.change(screen.getByLabelText('Fee model'), { target: { value: 'Sliding scale' } });
    fireEvent.change(screen.getByLabelText('Mediation style'), { target: { value: 'Calm written facilitation.' } });
    fireEvent.change(screen.getByLabelText('Response time estimate'), { target: { value: 'Within 24 hours' } });
    fireEvent.change(screen.getByLabelText('Rules of procedure'), { target: { value: 'Both parties share signed receipts and evidence summaries.' } });
    fireEvent.click(screen.getByLabelText('Public profile visibility'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Profile and mediator marketplace profile saved locally.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review profile publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review mediator publish' })).toBeInTheDocument();
    await waitFor(async () => expect(await db.mediators.count()).toBe(1));
    await expect(db.mediators.toCollection().first()).resolves.toMatchObject({
      id: expect.stringMatching(/^mediator_profile_/),
      displayName: 'alice',
      publicKey: identity.publicKey,
      feeModel: 'Sliding scale',
      specialties: ['marketplace disputes', 'repairs']
    });

    fireEvent.change(screen.getByLabelText('Fee model'), { target: { value: 'Donation optional' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => expect(await db.mediators.count()).toBe(1));
    await expect(db.mediators.toCollection().first()).resolves.toMatchObject({
      id: expect.stringMatching(/^mediator_profile_/),
      feeModel: 'Donation optional'
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mediators' }));
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Calm written facilitation.')).toBeInTheDocument();
  });

  it('shows remote profile-only mediator availability as an incomplete signal, not a full mediator', async () => {
    const publicKey = 'd'.repeat(64);
    await db.syncedProfiles.put({
      id: 'synced_profile_mediator_signal',
      eventId: 'event_profile_mediator_signal',
      kind: 39001,
      authorPublicKey: publicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      trusted: false,
      hidden: false,
      payload: {
        id: 'profile_mediator_signal',
        displayName: 'Signal Mediator',
        publicKey,
        avatarUrl: '',
        bio: 'Profile-only mediator signal',
        region: 'Prague',
        languages: ['en'],
        contactMethods: [],
        skills: ['mediation'],
        mediatorAvailable: true,
        publicVisibility: true,
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z'
      }
    });

    renderAppAt('#mediators');

    expect(await screen.findByText('Signal Mediator')).toBeInTheDocument();
    expect(screen.getByText(/no reviewed mediator profile/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('shows imported synced mediator records as full mediator cards', async () => {
    const publicKey = 'e'.repeat(64);
    await db.syncedMediators.put({
      id: 'synced_mediator_full',
      eventId: 'event_mediator_full',
      kind: 39003,
      authorPublicKey: publicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      trusted: false,
      hidden: false,
      payload: {
        id: 'mediator_full',
        displayName: 'Full Mediator',
        publicKey,
        region: 'Brno',
        languages: ['en', 'cs'],
        specialties: ['marketplace disputes'],
        feeModel: 'Sliding scale',
        mediationStyle: 'Structured voluntary mediation.',
        responseTime: 'Within 48 hours',
        caseCount: 2,
        contactMethods: [{ id: 'contact_full', kind: 'matrix', value: '@full:matrix.org' }],
        procedure: 'Both parties share signed trade context before mediation.',
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z'
      }
    });

    renderAppAt('#mediators');

    expect(await screen.findByText('Full Mediator')).toBeInTheDocument();
    expect(screen.getByText('Structured voluntary mediation.')).toBeInTheDocument();
    expect(screen.getByText('Both parties share signed trade context before mediation.')).toBeInTheDocument();
    expect(screen.queryByText(/no reviewed mediator profile/i)).not.toBeInTheDocument();
  });

  it('shows listing form guidance and disabled action explanations', async () => {
    renderAppAt('#listing');

    expect(await screen.findByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByPlaceholderText('Example: Repair help for bicycles')).toBeInTheDocument();
    expect(screen.queryByText(/Save the listing locally first/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Create an identity first/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create identity' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Listing readiness' })).toBeInTheDocument();
    expect(screen.getByLabelText('Listing creation progress')).toBeInTheDocument();
    expect(screen.getByText('Create or connect an identity before saving a listing.')).toBeInTheDocument();
    expect(screen.getByText('Add title, description, location, and contact before saving.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('Price amount')).toHaveValue('0');
    expect(screen.getByLabelText('Currency')).toHaveValue('FREE');
    expect(screen.getByLabelText('Status')).toHaveValue('active');
    expect(screen.getByLabelText('Visibility')).toHaveValue('public');
    expect(screen.getByLabelText('Expiration date')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create identity' }));
    expect(await screen.findByRole('main', { name: 'Profile' })).toBeInTheDocument();
  });

  it('keeps optional listing controls limited to trade context while essentials stay visible', async () => {
    await db.identity.put(identityFixture());

    renderAppAt('#listing');

    expect(await screen.findByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Visibility')).toHaveValue('public');
    expect(screen.getByLabelText('Expiration date')).toBeInTheDocument();
    expect(screen.queryByText('Other payment options')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Listing images')).toBeInTheDocument();
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));
    expect(screen.getByRole('heading', { name: 'Trade context' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Payment' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fulfillment')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fulfillment notes')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Other payment options' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cash')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Barter accepted')).toBeInTheDocument();
    expect(screen.queryByLabelText('Other')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Payment method')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Payment address or URI')).not.toBeInTheDocument();
  });

  it('uses the same compact listing card structure in Discover and My listings', async () => {
    await db.listings.put(listingFixture({ title: 'Stable card item', region: 'South Moravia' }));

    renderAppAt('#browse');

    const discoverCard = (await screen.findByText('Stable card item')).closest('article');
    expect(discoverCard).toHaveClass('listing-card');
    expect(discoverCard?.querySelector('.listing-card-thumb')).not.toBeNull();
    expect(discoverCard?.querySelector('.listing-card-body')).not.toBeNull();
    expect(discoverCard).toHaveTextContent('Repairs');
    expect(discoverCard).toHaveTextContent('South Moravia');
    expect(within(discoverCard as HTMLElement).getByRole('button', { name: 'View item' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'My listings' }));

    const myListingsCard = (await screen.findByText('Stable card item')).closest('article');
    expect(myListingsCard).toHaveClass('listing-card');
    expect(myListingsCard?.querySelector('.listing-card-thumb')).not.toBeNull();
    expect(myListingsCard?.querySelector('.listing-card-body')).not.toBeNull();
    expect(within(myListingsCard as HTMLElement).getByRole('button', { name: 'View item' })).toBeInTheDocument();
  });

  it('prioritizes NIP-99 price, status, location, and tags on listing cards', async () => {
    await db.listings.put(
      listingFixture({
        title: 'Priced classified',
        price: { amount: '500', currency: 'CZK' },
        region: 'Ostrava',
        images: [{ id: 'external_image', url: 'https://shop.example/listing.webp' }],
        tags: ['bike', 'repair'],
        paymentPreferences: ['cashu'],
        fulfillmentType: 'shipping'
      })
    );

    renderAppAt('#browse');

    const card = (await screen.findByText('Priced classified')).closest('article') as HTMLElement;
    expect(card.querySelector('.listing-card-primary')).toHaveTextContent('500 CZK');
    expect(card.querySelector('.listing-card-primary')).toHaveTextContent('Active');
    expect(card.querySelector('.listing-card-facts')).toHaveTextContent('Ostrava');
    expect(card.querySelector('.listing-card-taxonomy')).toHaveTextContent('bike');
    expect(card.querySelector('.listing-card-taxonomy')).toHaveTextContent('repair');
    expect(card.querySelector('.listing-card-settlement')).toBeNull();
    expect(card.querySelector('img')).toHaveAttribute('src', 'https://shop.example/listing.webp');
  });

  it('keeps newest default ordering and filters listings with images on demand', async () => {
    await db.listings.bulkPut([
      listingFixture({
        id: 'newer_no_image',
        title: 'Newer listing without image',
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
        images: []
      }),
      listingFixture({
        id: 'older_with_image',
        title: 'Older listing with image',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        images: [{ id: 'image_ordered', url: 'https://media.example/ordered.webp' }]
      })
    ]);

    renderAppAt('#browse');

    expect(await screen.findByRole('heading', { name: 'Older listing with image' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Newer listing without image' })).toBeInTheDocument();
    let cardTitles = [...document.querySelectorAll('.listing-card h2')].map((heading) => heading.textContent);
    expect(cardTitles.slice(0, 2)).toEqual(['Newer listing without image', 'Older listing with image']);

    const noImageCard = screen.getByRole('heading', { name: 'Newer listing without image' }).closest('article') as HTMLElement;
    expect(noImageCard.querySelector('.listing-card-thumb-title')).toHaveAttribute('data-title', 'Newer listing without image');

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.click(screen.getByLabelText('Listings with images only'));

    expect(screen.queryByRole('heading', { name: 'Newer listing without image' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Older listing with image' })).toBeInTheDocument();
    cardTitles = [...document.querySelectorAll('.listing-card h2')].map((heading) => heading.textContent);
    expect(cardTitles[0]).toBe('Older listing with image');
  });

  it('shows a simple listing image flipper and image count marker', async () => {
    await db.listings.put(
      listingFixture({
        id: 'listing_flipper',
        title: 'Image flipper listing',
        images: [
          { id: 'image_one', url: 'https://media.example/one.webp', altText: 'Front view' },
          { id: 'image_two', url: 'https://media.example/two.webp', altText: 'Side view' },
          { id: 'image_three', url: 'https://media.example/three.webp', altText: 'Detail view' }
        ]
      })
    );

    renderAppAt('#browse');

    const card = (await screen.findByText('Image flipper listing')).closest('article') as HTMLElement;
    expect(card.querySelector('.listing-card-image-count')).toHaveTextContent('3');
    fireEvent.click(within(card).getByRole('button', { name: 'View item' }));

    expect(await screen.findByRole('img', { name: 'Front view' })).toHaveAttribute('src', 'https://media.example/one.webp');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(await screen.findByRole('img', { name: 'Side view' })).toHaveAttribute('src', 'https://media.example/two.webp');
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(await screen.findByRole('img', { name: 'Front view' })).toBeInTheDocument();
  });

  it('hides deleted NIP-99 listings from Discover by default', async () => {
    await db.listings.bulkPut([
      listingFixture({ id: 'active_status_listing', title: 'Active status listing', status: 'active' }),
      listingFixture({ id: 'deleted_status_listing', title: 'Deleted status listing', status: 'deleted' })
    ]);

    renderAppAt('#browse');

    expect(await screen.findByText('Active status listing')).toBeInTheDocument();
    expect(screen.queryByText('Deleted status listing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'My listings' }));
    expect(await screen.findByText('Active status listing')).toBeInTheDocument();
    expect(screen.queryByText('Deleted status listing')).not.toBeInTheDocument();
  });

  it('allows the local author to edit a listing without publishing', async () => {
    const identity = identityFixture();
    const listing = listingFixture({
      id: 'listing_edit_author',
      authorPublicKey: identity.publicKey,
      title: 'Original classified',
      price: { amount: '100', currency: 'CZK' },
      paymentPreferences: ['cashu'],
      fulfillmentType: 'local-pickup',
      fulfillmentNotes: 'Meet near the library.'
    });
    await db.identity.put(identity);
    await db.listings.put(listing);

    renderAppAt('#listing/local/listing_edit_author');

    expect(await screen.findByRole('heading', { name: 'Original classified' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit listing' }));
    expect(await screen.findByRole('heading', { name: 'Edit listing' })).toBeInTheDocument();
    expect(screen.getByLabelText('Price amount')).toHaveValue('100');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated classified' } });
    fireEvent.change(screen.getByLabelText('Price amount'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Listing saved locally.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Review publish update' })).toBeInTheDocument();
    await waitFor(async () => {
      const updated = await db.listings.get('listing_edit_author');
      expect(updated).toMatchObject({
        id: 'listing_edit_author',
        title: 'Updated classified',
        price: { amount: '150', currency: 'CZK' },
        paymentPreferences: ['cashu'],
        fulfillmentType: 'local-pickup',
        fulfillmentNotes: 'Meet near the library.',
        createdAt: listing.createdAt
      });
    });
    await expect(db.publishReceipts.count()).resolves.toBe(0);
  });

  it('edits existing listing image order, removal, and per-image alt text locally', async () => {
    const identity = identityFixture();
    const listing = listingFixture({
      id: 'listing_edit_images',
      authorPublicKey: identity.publicKey,
      title: 'Gallery listing',
      images: [
        { id: 'image_first', url: 'https://media.example/first.webp', altText: 'First image' },
        { id: 'image_second', url: 'https://media.example/second.webp', altText: 'Second image' }
      ]
    });
    await db.identity.put(identity);
    await db.listings.put(listing);

    renderAppAt('#listing/local/listing_edit_images');

    expect(await screen.findByRole('heading', { name: 'Gallery listing' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit listing' }));
    expect(await screen.findByRole('heading', { name: 'Edit listing' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Earlier' })[1]);
    fireEvent.change(screen.getByLabelText('Alt text for image 1'), { target: { value: 'Primary gallery image' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const updated = await db.listings.get('listing_edit_images');
      expect(updated?.images).toEqual([{ id: 'image_second', url: 'https://media.example/second.webp', altText: 'Primary gallery image' }]);
    });
    await expect(db.publishReceipts.count()).resolves.toBe(0);
  });

  it('does not offer editing for non-author local or synced listings', async () => {
    await db.identity.put(identityFixture());
    await db.listings.put(listingFixture({ id: 'listing_not_author', authorPublicKey: 'b'.repeat(64), title: 'Other local listing' }));
    await db.syncedListings.put({
      id: 'synced_not_author',
      eventId: 'event_not_author',
      kind: 30402,
      authorPublicKey: 'c'.repeat(64),
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: listingFixture({ id: 'listing_synced_not_author', authorPublicKey: 'c'.repeat(64), title: 'Other synced listing' }),
      trusted: false,
      hidden: false
    });

    renderAppAt('#listing/local/listing_not_author');

    expect(await screen.findByRole('heading', { name: 'Other local listing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit listing' })).not.toBeInTheDocument();

    cleanup();
    renderAppAt('#listing/synced/synced_not_author');

    expect(await screen.findByRole('heading', { name: 'Other synced listing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit listing' })).not.toBeInTheDocument();
  });

  it('saves public-ready listings without publishing to relays', async () => {
    await db.identity.put(identityFixture());

    renderAppAt('#listing');

    expect(await screen.findByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Repair help for bicycles' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Weekend repair help near Prague.' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Prague' } });
    fireEvent.change(screen.getByLabelText('Contact method'), { target: { value: '@alice:matrix.org' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Listing saved locally.')).toBeInTheDocument();
    expect(await screen.findByRole('main', { name: 'Listing details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review publish options' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish options' }));
    expect(await screen.findByText('No relay receipts for this listing yet.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.listings.count()).toBe(1));
    const savedListing = (await db.listings.toArray())[0];
    expect(savedListing.paymentPreferences).toEqual(['other']);
    expect(savedListing.fulfillmentType).toBeUndefined();
    expect(savedListing.fulfillmentNotes).toBeUndefined();
    await expect(db.publishReceipts.count()).resolves.toBe(0);
  });

  it('saves local listings without public-ready next-step copy', async () => {
    await db.identity.put(identityFixture());

    renderAppAt('#listing');

    expect(await screen.findByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Local repair help' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Local-only repair help near Prague.' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Prague' } });
    fireEvent.change(screen.getByLabelText('Contact method'), { target: { value: '@alice:matrix.org' } });
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Listing saved locally.')).toBeInTheDocument();
    expect(screen.queryByText('This listing is public-ready but not published yet. Open My listings when you are ready to publish it to relays.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review publish options' })).not.toBeInTheDocument();
    await waitFor(async () => expect((await db.listings.toArray())[0]?.visibility).toBe('local'));
  });

  it('shows a form alert and does not save prohibited listing text', async () => {
    await db.identity.put(identityFixture());

    renderAppAt('#listing');

    expect(await screen.findByRole('tab', { name: 'Create listing' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Stolen phone' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'No questions asked.' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Prague' } });
    fireEvent.change(screen.getByLabelText('Contact method'), { target: { value: '@alice:matrix.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/prohibited/i);
    await expect(db.listings.count()).resolves.toBe(0);
  });

  it('shows non-blocking media guidance when images are selected without a Blossom server', async () => {
    await db.identity.put(identityFixture());

    renderAppAt('#listing');

    const image = new File(['image'], 'listing.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Listing images'), { target: { files: [image] } });

    expect(await screen.findByText(/Images are selected, but no Blossom media server is enabled/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Repair help with image' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Weekend repair help near Prague.' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Prague' } });
    fireEvent.change(screen.getByLabelText('Contact method'), { target: { value: '@alice:matrix.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Listing saved locally.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.listings.count()).toBe(1));
  });

  it('prompts to link a connected browser signer before uploading listing images', async () => {
    await db.identity.put(identityFixture());
    await db.blossomServers.put({ id: 'blossom_test', url: 'https://blossom.primal.net', enabled: true });
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      value: {
        getPublicKey: vi.fn().mockResolvedValue('b'.repeat(64)),
        signEvent: vi.fn()
      }
    });

    renderAppAt('#listing');

    const image = new File(['image'], 'listing.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Listing images'), { target: { files: [image] } });

    expect(await screen.findByText(/connect the matching Nostr signer/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect signer' }));

    expect(await screen.findByRole('button', { name: 'Use as active identity' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use as active identity' }));

    await waitFor(async () => {
      await expect(db.identity.toCollection().first()).resolves.toMatchObject({ publicKey: 'b'.repeat(64), keySource: 'nostr-extension' });
    });
  });

  it('supports identity backup verification and locking the decrypted key', async () => {
    renderAppAt('#profile');

    fireEvent.click(await screen.findByRole('button', { name: 'Generate new identity' }));
    fireEvent.change((await screen.findAllByLabelText('Display name'))[1], { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'correct horse battery staple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create encrypted identity' }));

    fireEvent.click(await screen.findByRole('tab', { name: 'Backup' }));
    const backupWarning = await screen.findByText(/Identity backup is not confirmed/i);
    expect(backupWarning.closest('[role="status"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Identity' }));
    fireEvent.click(screen.getByRole('button', { name: /Unlock for signing/i }));

    const backupConfirmed = await screen.findByText(/Identity backup\/passphrase verified/i);
    expect(backupConfirmed.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByText(/Local encrypted key · Unlocked/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Lock key/i }));
    expect(screen.getByRole('button', { name: /Unlock for signing/i })).toBeInTheDocument();
  });

  it('forgets the active identity without deleting marketplace records', async () => {
    const identity: IdentityRecord = {
      id: 'identity_forget',
      displayName: 'alice',
      publicKey: 'a'.repeat(64),
      keySource: 'local',
      encryptedPrivateKey: {
        ciphertext: 'encrypted',
        iv: 'iv',
        salt: 'salt',
        iterations: 210000,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA-256'
      },
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.identity.put(identity);
    await db.listings.put(listingFixture());

    renderAppAt('#profile');

    fireEvent.click(await screen.findByRole('button', { name: 'Status details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget active identity' }));

    expect(await screen.findByText('Active identity forgotten locally.')).toBeInTheDocument();
    await expect(db.identity.count()).resolves.toBe(0);
    await expect(db.listings.count()).resolves.toBe(1);
  });

  it('shows encrypted dispute bundle controls alongside unencrypted export', async () => {
    const agreement: Agreement = {
      id: 'agreement_1',
      buyer: 'alice',
      seller: 'bob',
      exchangeDescription: 'Laptop repair',
      priceAndPayment: 'cash',
      fulfillmentTerms: 'public meetup',
      deadline: '2026-06-30',
      refundTerms: 'refund if not fulfilled',
      evidenceExpectations: 'receipts',
      buyerAccepted: true,
      sellerAccepted: true,
      hash: 'b'.repeat(64),
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const dispute: DisputeCase = {
      id: 'dispute_1',
      state: 'opened',
      agreementHash: agreement.hash,
      claimant: 'alice',
      respondent: 'bob',
      claimSummary: 'Private claim',
      requestedResolution: 'Refund',
      timeline: [],
      evidence: [],
      publishOutcomeAttestation: false,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.agreements.put(agreement);
    await db.disputes.put(dispute);

    renderAppAt('#disputes');
    fireEvent.click(await screen.findByRole('tab', { name: 'Outcome' }));

    expect(await screen.findByText('Export unencrypted JSON')).toBeInTheDocument();
    expect(screen.getByText('Export encrypted bundle')).toBeInTheDocument();
    expect(screen.getByText('Import encrypted bundle')).toBeInTheDocument();
    expect(screen.getByLabelText('Import encrypted bundle')).toHaveAttribute('type', 'file');
    expect(screen.getByText('Choose a JSON file from this device.')).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: /Export encrypted bundle/i })).toHaveAttribute(
      'title',
      'Enter at least 10 characters before exporting an encrypted bundle.'
    );
  });

  it('renders review queue items without auto-importing them', async () => {
    const item: NostrReviewItem = {
      id: 'review_event',
      eventId: 'event_1',
      kind: 30402,
      relay: 'wss://relay.example',
      authorPublicKey: 'a'.repeat(64),
      receivedAt: '2026-05-31T00:00:00.000Z',
      signatureValid: false,
      importStatus: 'invalid',
      payloadPreview: 'Invalid signature',
      rawEvent: '{}'
    };
    await db.nostrReview.put(item);

    renderAppAt('#settings:review');

    expect(await screen.findByRole('tab', { name: 'Diagnostics' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Invalid and unsupported (1)' })).toBeInTheDocument();
    expect(screen.queryByText('event_1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Invalid and unsupported (1)' }));
    expect(await screen.findByText('event_1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import reviewed item' })).not.toBeInTheDocument();
    await waitFor(async () => expect(await db.listings.count()).toBe(0));
  });

  it('filters review items and bulk-rejects visible invalid records only', async () => {
    await db.nostrReview.bulkPut([
      {
        id: 'review_pending_valid',
        eventId: 'event_pending_valid',
        kind: 30402,
        relay: 'wss://relay.example',
        authorPublicKey: 'a'.repeat(64),
        receivedAt: '2026-05-31T00:00:00.000Z',
        signatureValid: true,
        importStatus: 'pending',
        payloadPreview: 'Encrypted AgoraMesh relay content.',
        rawEvent: '{}'
      },
      {
        id: 'review_expired_listing',
        eventId: 'event_expired_listing',
        kind: 30402,
        relay: 'wss://relay.example',
        authorPublicKey: 'c'.repeat(64),
        receivedAt: '2026-05-31T00:00:00.000Z',
        signatureValid: true,
        importStatus: 'pending',
        payloadPreview: JSON.stringify(listingFixture({ id: 'expired_review_listing', title: 'Expired review listing', expiresAt: '2020-06-30' })),
        rawEvent: '{}'
      },
      {
        id: 'review_invalid',
        eventId: 'event_invalid',
        kind: 30402,
        relay: 'wss://relay.example',
        authorPublicKey: 'b'.repeat(64),
        receivedAt: '2026-05-31T00:00:00.000Z',
        signatureValid: false,
        importStatus: 'invalid',
        payloadPreview: 'Invalid signature',
        rawEvent: '{}'
      }
    ]);

    renderAppAt('#settings:review');

    expect(await screen.findByText('event_pending_valid')).toBeInTheDocument();
    expect(screen.queryByText('event_expired_listing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show expired listings'));
    expect(await screen.findByText('event_expired_listing')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show expired listings'));
    fireEvent.change(screen.getByLabelText('Review status'), { target: { value: 'invalid' } });
    expect(screen.queryByText('event_pending_valid')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Invalid and unsupported (1)' }));
    expect(await screen.findByText('event_invalid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject visible invalid/unsupported' }));

    await waitFor(async () => expect((await db.nostrReview.get('review_invalid'))?.importStatus).toBe('rejected'));
    await expect(db.nostrReview.get('review_pending_valid')).resolves.toMatchObject({ importStatus: 'pending' });
  });

  it('shows synced listings through the source filter without local import', async () => {
    const listing: Listing = {
      id: 'listing_synced',
      authorPublicKey: 'b'.repeat(64),
      title: 'Synced tutoring',
      type: 'offer',
      category: 'tutoring',
      description: 'Public synced listing.',
      region: 'Prague',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['cash'],
      barterAccepted: false,
      tags: ['math'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_1', kind: 'matrix', value: '@teacher:matrix.org' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const record: SyncedPublicRecord<Listing> = {
      id: 'synced_event_1',
      eventId: 'event_1',
      kind: 30402,
      authorPublicKey: listing.authorPublicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: listing,
      trusted: false,
      hidden: false
    };
    await db.syncedListings.put(record);

    renderAppAt('#browse');

    expect(await screen.findByText('Synced tutoring')).toBeInTheDocument();
    expect(screen.queryByText('matrix: @teacher:matrix.org')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.getByText('Item details')).toBeInTheDocument();
    expect(screen.getByText('matrix: @teacher:matrix.org')).toBeInTheDocument();
    await expect(db.listings.count()).resolves.toBe(0);
  });

  it('keeps marketplace cards compact until details are opened', async () => {
    const longDescription =
      'Repair help for bicycles with standard tools and a calm meetup near the public square. This short summary should stay readable while the card remains compact for scanning. The private tail stays hidden until details open.';
    await db.listings.put(
      listingFixture({
        title: 'Compact repair card',
        description: longDescription,
        contactMethod: { id: 'contact_compact', kind: 'matrix', value: '@compact:matrix.org' },
        tags: ['quiet-detail']
      })
    );

    renderAppAt('#browse');

    expect(await screen.findByText('Compact repair card')).toBeInTheDocument();
    expect(screen.queryByText(/Repair help for bicycles with standard tools/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private tail stays hidden/i)).not.toBeInTheDocument();
    expect(screen.queryByText('matrix: @compact:matrix.org')).not.toBeInTheDocument();
    expect(screen.getByText('quiet-detail')).toBeInTheDocument();
    expect(screen.queryByText(/Marketplace shows local listings/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    expect(screen.getByText(/Marketplace shows local listings/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.getByText(/Repair help for bicycles with standard tools/i)).toBeInTheDocument();
    expect(screen.getByText(/private tail stays hidden/i)).toBeInTheDocument();
    expect(screen.getByText('matrix: @compact:matrix.org')).toBeInTheDocument();
    expect(screen.getByText('quiet-detail')).toBeInTheDocument();
  });

  it('shows marketplace discovery badges and seller context only in listing details', async () => {
    await db.profile.put({
      id: 'profile_seller',
      displayName: 'Repair Seller',
      publicKey: 'a'.repeat(64),
      bio: 'Local repair profile',
      region: 'Brno',
      languages: ['en'],
      contactMethods: [],
      skills: ['repair'],
      mediatorAvailable: false,
      publicVisibility: true,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    });
    await db.listings.put(
      listingFixture({
        title: 'Cashu repair offer',
        authorPublicKey: 'a'.repeat(64),
        paymentPreferences: ['cashu'],
        paymentIntents: [{ id: 'intent_cashu', method: 'cashu', value: 'cashuAexample', note: 'Public token instruction' }],
        fulfillmentType: 'local-pickup',
        fulfillmentNotes: 'Meet near the library.',
        tags: ['cashu-ok']
      })
    );

    renderAppAt('#browse');

    expect(await screen.findByText('Cashu repair offer')).toBeInTheDocument();
    expect(screen.getAllByText('Repairs').length).toBeGreaterThan(0);
    expect(screen.getByText(/Local pickup .* Cashu/)).toBeInTheDocument();
    expect(screen.queryByText('Repair Seller')).not.toBeInTheDocument();
    expect(screen.queryByText('cashuAexample')).not.toBeInTheDocument();
    expect(screen.getByText('cashu-ok')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.getByText('Repair Seller')).toBeInTheDocument();
    expect(screen.getByText('cashuAexample')).toBeInTheDocument();
    expect(screen.getByText('cashu-ok')).toBeInTheDocument();
    expect(screen.getByText('Meet near the library.')).toBeInTheDocument();
    expect(screen.getByText(/do not verify legal identity/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cashu' }));
    expect(screen.getByText('Manual Cashu')).toBeInTheDocument();
    expect(screen.getByText('Public token instruction')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Cashu details/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nutzaps' }));
    expect(screen.getByText('Nutzap sending is not enabled in this build.')).toBeInTheDocument();
  });

  it('keeps listing contact and payment workflows separated behind compact actions', async () => {
    await db.listings.put(
      listingFixture({
        title: 'Multimode contact listing',
        authorPublicKey: 'b'.repeat(64),
        contactMethod: { id: 'contact_nostr', kind: 'nostr', value: 'b'.repeat(64) },
        paymentPreferences: ['lightning', 'cashu'],
        paymentIntents: [
          { id: 'intent_lightning', method: 'lightning', value: 'seller@example.com', note: '' },
          { id: 'intent_cashu', method: 'cashu', value: 'cashuAcompact', note: 'Manual Cashu handoff' }
        ]
      })
    );

    renderAppAt('#browse');

    expect(await screen.findByText('Multimode contact listing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.getByText('Choose how you want to contact or pay. Nothing is sent until you confirm it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lightning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cashu' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Message' }));
    expect(screen.getByText('Needs setup')).toBeInTheDocument();
    expect(screen.getByText('Create or connect an identity before sending a Nostr message.')).toBeInTheDocument();
    expect(screen.queryByText(/relays can still observe/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Message details' }));
    expect(screen.getByText(/relays can still observe/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lightning' }));
    expect(screen.getByText('No wallet')).toBeInTheDocument();
    expect(screen.getByText('No invoice yet')).toBeInTheDocument();
    expect(screen.getByText('Create or connect an identity before generating a zap request.')).toBeInTheDocument();
    expect(screen.queryByText('seller@example.com')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Payment details' }));
    expect(screen.getByText('seller@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cashu' }));
    expect(screen.getByText('Manual Cashu')).toBeInTheDocument();
    expect(screen.getByText('Manual Cashu handoff')).toBeInTheDocument();
    expect(screen.getByText('cashuAcompact')).toBeInTheDocument();
  });

  it('shows seller offer composer only on buyer requests', async () => {
    await db.identity.put(identityFixture());
    await db.listings.put(
      listingFixture({
        id: 'buyer_request_offerable',
        title: 'Need a local mechanic',
        type: 'request',
        authorPublicKey: 'b'.repeat(64),
        contactMethod: { id: 'request_contact', kind: 'nostr', value: 'b'.repeat(64) },
        paymentPreferences: ['cash']
      })
    );

    renderAppAt('#browse');

    expect(await screen.findByText('Need a local mechanic')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.getByRole('heading', { name: 'Send offer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(screen.getByLabelText('Fulfillment terms')).toBeInTheDocument();

    cleanup();
    await deleteLocalData();
    await db.identity.put(identityFixture());
    await db.listings.put(listingFixture({ title: 'Normal offer listing', authorPublicKey: 'b'.repeat(64), type: 'offer' }));

    renderAppAt('#browse');

    expect(await screen.findByText('Normal offer listing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.queryByRole('heading', { name: 'Send offer' })).not.toBeInTheDocument();
  });

  it('lets a buyer choose a received request offer and creates an agreement draft', async () => {
    const identity = identityFixture();
    const listing = listingFixture({
      id: 'buyer_request_choose',
      title: 'Need translation help',
      type: 'request',
      authorPublicKey: identity.publicKey,
      paymentPreferences: ['cash'],
      price: { amount: '800', currency: 'CZK' }
    });
    const offer: BuyerRequestOffer = {
      id: 'buyer_offer_choose',
      requestListingId: listing.id,
      requestCoordinate: `30402:${identity.publicKey}:${listing.id}`,
      requestTitle: listing.title,
      buyerPublicKey: identity.publicKey,
      sellerPublicKey: 'b'.repeat(64),
      amount: '700',
      currency: 'CZK',
      fulfillmentNotes: 'I can translate it tonight.',
      timeline: 'Tonight',
      paymentPreferences: ['cash'],
      message: 'I have translation experience.',
      sourceEventIds: ['event_offer_choose'],
      direction: 'incoming',
      status: 'received',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z'
    };
    await db.identity.put(identity);
    await db.listings.put(listing);
    await db.buyerRequestOffers.put(offer);

    renderAppAt('#browse');

    expect(await screen.findByText('Need translation help')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.getByRole('heading', { name: 'Seller offers' })).toBeInTheDocument();
    expect(screen.getByText('I can translate it tonight.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose offer' }));

    expect(await screen.findByRole('main', { name: 'Trade' })).toBeInTheDocument();
    await waitFor(async () => expect(await db.agreements.count()).toBe(1));
    await expect(db.buyerRequestOffers.get(offer.id)).resolves.toMatchObject({ status: 'selected' });
    await expect(db.agreements.toCollection().first()).resolves.toMatchObject({
      listingId: listing.id,
      buyerPublicKey: identity.publicKey,
      sellerPublicKey: 'b'.repeat(64),
      priceAndPayment: '700 CZK · cash'
    });
  });

  it('shows public sync wizard steps for missing relays and ready marketplace data', async () => {
    await db.relays.put({ url: 'wss://disabled.example', enabled: false });
    renderAppAt('#settings');

    expect(await screen.findByRole('heading', { name: 'Public Sync Wizard' })).toBeInTheDocument();
    expect(screen.getByText('Add or enable a relay before fetching public records.')).toBeInTheDocument();

    cleanup();
    await deleteLocalData();
    await db.relays.put({ url: 'wss://relay.example', enabled: true });
    await db.listings.put(listingFixture());
    await db.nostrReview.put({
      id: 'review_sync_wizard',
      eventId: 'event_sync_wizard',
      kind: 30402,
      relay: 'wss://relay.example',
      authorPublicKey: 'b'.repeat(64),
      receivedAt: '2026-05-31T00:00:00.000Z',
      signatureValid: true,
      importStatus: 'pending',
      payloadPreview: 'Pending listing',
      rawEvent: '{}'
    });
    await db.syncedListings.put({
      id: 'synced_sync_wizard',
      eventId: 'event_synced_sync_wizard',
      kind: 30402,
      authorPublicKey: 'b'.repeat(64),
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: listingFixture({ id: 'synced_sync_listing', title: 'Synced sync wizard listing', authorPublicKey: 'b'.repeat(64) }),
      trusted: false,
      hidden: false
    });

    renderAppAt('#settings');

    expect(await screen.findByText('At least one relay is enabled for public marketplace sync.')).toBeInTheDocument();
    expect(screen.getByText('Approved public records are in the local public cache.')).toBeInTheDocument();
    expect(screen.getByText('Open Marketplace to publish your own listing or browse public records.')).toBeInTheDocument();
  });

  it('starts a private trade from a local marketplace listing', async () => {
    const listing = listingFixture({ title: 'Local trade listing', paymentPreferences: ['cash', 'barter'] });
    await db.listings.put(listing);

    renderAppAt('#browse');

    expect(await screen.findByText('Local trade listing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start private trade' }));

    expect(await screen.findByRole('main', { name: 'Trade' })).toBeInTheDocument();
    expect(screen.getByText('Trade details stay local; copy or export them through your chosen channel.')).toBeInTheDocument();
    expect(screen.queryByText(/Agreement terms, dispute details/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Local sharing model' }));
    expect(screen.getByText(/Agreement terms, dispute details/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Exchange description')).toHaveValue('Local trade listing');
    expect(screen.getByLabelText('Seller/provider')).toHaveValue(listing.authorPublicKey);
    expect(screen.getByLabelText('Price/payment method')).toHaveValue('FREE · cash, barter');
    expect(screen.getByLabelText('Listings')).toHaveValue(listing.id);
  });

  it('starts a private trade from a synced listing without local import', async () => {
    const listing = listingFixture({
      id: 'listing_synced_trade',
      authorPublicKey: 'b'.repeat(64),
      title: 'Synced trade listing',
      paymentPreferences: ['lightning']
    });
    await db.syncedListings.put({
      id: 'synced_trade_1',
      eventId: 'event_trade_1',
      kind: 30402,
      authorPublicKey: listing.authorPublicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: listing,
      trusted: false,
      hidden: false
    });

    renderAppAt('#browse');

    expect(await screen.findByText('Synced trade listing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start private trade' }));

    expect(await screen.findByRole('main', { name: 'Trade' })).toBeInTheDocument();
    expect(screen.getByLabelText('Exchange description')).toHaveValue('Synced trade listing');
    expect(screen.getByLabelText('Seller/provider')).toHaveValue(listing.authorPublicKey);
    expect(screen.getByLabelText('Price/payment method')).toHaveValue('FREE · lightning');
    expect(screen.getByLabelText('Listings')).toHaveValue('synced:synced_trade_1');
    await expect(db.listings.count()).resolves.toBe(0);
  });

  it('excludes expired synced listings from public cache by default', async () => {
    await db.syncedListings.bulkPut([
      {
        id: 'synced_active_cache',
        eventId: 'event_active_cache',
        kind: 30402,
        authorPublicKey: 'a'.repeat(64),
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-05-31T00:00:00.000Z',
        importedAt: '2026-05-31T00:00:00.000Z',
        payload: listingFixture({ id: 'active_cache_listing', title: 'Active cache listing', expiresAt: '2026-06-30' }),
        trusted: false,
        hidden: false
      },
      {
        id: 'synced_expired_cache',
        eventId: 'event_expired_cache',
        kind: 30402,
        authorPublicKey: 'b'.repeat(64),
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-05-31T00:00:00.000Z',
        importedAt: '2026-05-31T00:00:00.000Z',
        payload: listingFixture({ id: 'expired_cache_listing', title: 'Expired cache listing', expiresAt: '2020-06-30' }),
        trusted: false,
        hidden: false
      }
    ]);

    renderAppAt('#settings:cache');

    expect(await screen.findByText('Synced public listings')).toBeInTheDocument();
    expect(screen.getByText('Active cache listing')).toBeInTheDocument();
    expect(screen.queryByText('Expired cache listing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show expired listings'));
    expect(await screen.findByText('Expired cache listing')).toBeInTheDocument();
  });

  it('keeps local listing publish controls off cards and on local item pages', async () => {
    const listing: Listing = {
      id: 'listing_public',
      authorPublicKey: 'c'.repeat(64),
      title: 'Public repair help',
      type: 'offer',
      category: 'repairs',
      description: 'Repair help available.',
      region: 'Brno',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['cash'],
      barterAccepted: false,
      tags: ['tools'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_public', kind: 'matrix', value: '@repair:matrix.org' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.listings.put(listing);
    await db.publishReceipts.bulkPut([
      {
        id: 'receipt_accepted',
        objectType: 'listing',
        objectId: listing.id,
        eventId: 'event_accepted',
        relayUrl: 'wss://relay.example',
        status: 'accepted',
        message: 'accepted',
        at: '2026-05-31T00:00:00.000Z'
      },
      {
        id: 'receipt_failed',
        objectType: 'listing',
        objectId: listing.id,
        eventId: 'event_failed',
        relayUrl: 'wss://failed.example',
        status: 'failed',
        message: 'failed',
        at: '2026-05-31T00:00:01.000Z'
      }
    ]);

    renderAppAt('#browse');

    expect(await screen.findByText('Public repair help')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.queryByText('Relay receipts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish options' }));
    expect(screen.getByText('Relay receipts')).toBeInTheDocument();
    expect(screen.getByText(/Accepted: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed: 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish NIP-99 classified' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why this matters' }));
    expect(screen.getByText(/Public publishing sends this listing/i)).toBeInTheDocument();
  });

  it('disables listing publishing when no relay is enabled', async () => {
    await db.listings.put(listingFixture());
    await db.relays.clear();
    await db.relays.bulkPut([{ url: 'wss://disabled.example', enabled: false }]);

    renderAppAt('#browse:mine');

    expect(await screen.findByText('Public repair help')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish options' }));
    expect(screen.getByText('Add and enable a relay before publishing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish NIP-99 classified' })).toBeDisabled();
  });

  it('hides and unhides synced listings without writing local records', async () => {
    const listing: Listing = {
      id: 'listing_hidden',
      authorPublicKey: 'd'.repeat(64),
      title: 'Synced repair',
      type: 'offer',
      category: 'repairs',
      description: 'Public synced repair listing.',
      region: 'Prague',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['cash'],
      barterAccepted: false,
      tags: ['repair'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_2', kind: 'matrix', value: '@repair:matrix.org' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.syncedListings.put({
      id: 'synced_hidden_1',
      eventId: 'event_hidden_1',
      kind: 30402,
      authorPublicKey: listing.authorPublicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: listing,
      trusted: false,
      hidden: false
    });

    renderAppAt('#browse');

    expect(await screen.findByText('Synced repair')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide synced record' }));
    await waitFor(async () => expect((await db.syncedListings.get('synced_hidden_1'))?.hidden).toBe(true));
    await expect(db.listings.count()).resolves.toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Marketplace' }));
    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'hidden' } });
    expect(await screen.findByText('Synced repair')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(await screen.findByText('Hidden locally')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unhide synced record' }));
    await waitFor(async () => expect((await db.syncedListings.get('synced_hidden_1'))?.hidden).toBe(false));
  });

  it('labels synced conflicts and offers duplicate moderation actions', async () => {
    const listing: Listing = {
      id: 'listing_conflict',
      authorPublicKey: 'e'.repeat(64),
      title: 'Conflict listing',
      type: 'offer',
      category: 'tutoring',
      description: 'First version.',
      region: 'Prague',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['cash'],
      barterAccepted: false,
      tags: ['math'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_3', kind: 'matrix', value: '@first:matrix.org' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.syncedListings.bulkPut([
      {
        id: 'synced_conflict_1',
        eventId: 'event_conflict_1',
        kind: 30402,
        authorPublicKey: listing.authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-05-31T00:00:00.000Z',
        importedAt: '2026-05-31T00:00:00.000Z',
        payload: listing,
        trusted: false,
        hidden: false
      },
      {
        id: 'synced_conflict_2',
        eventId: 'event_conflict_2',
        kind: 30402,
        authorPublicKey: listing.authorPublicKey,
        relayUrls: ['wss://relay.example'],
        receivedAt: '2026-05-31T00:00:01.000Z',
        importedAt: '2026-05-31T00:00:01.000Z',
        payload: { ...listing, description: 'Second version.', updatedAt: '2026-05-31T00:00:01.000Z' },
        trusted: false,
        hidden: false
      }
    ]);

    renderAppAt('#browse');

    expect(await screen.findByText('Conflict listing')).toBeInTheDocument();
    expect(screen.getByText(/Hidden duplicates: 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(screen.getByText(/Ranking signals:/i)).toBeInTheDocument();
    expect(await screen.findByText('Possible duplicate')).toBeInTheDocument();
    expect(screen.getByText('Latest conflict version')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep visible' })).toBeInTheDocument();
  });

  it('shows relay scores in settings', async () => {
    const health: RelayHealth = {
      url: 'wss://healthy.example',
      enabled: true,
      latencyMs: 300,
      eventsReceived: 10,
      eventsPublished: 5,
      consecutiveFailures: 0
    };
    await db.relayHealth.put(health);

    renderAppAt('#settings');

    fireEvent.click(await screen.findByRole('tab', { name: 'Diagnostics' }));
    expect(await screen.findByText('wss://healthy.example')).toBeInTheDocument();
    expect(screen.getByText(/Relay score: 100\/100/i)).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('manages allowlist entries in settings', async () => {
    renderAppAt('#settings');

    fireEvent.click(await screen.findByRole('tab', { name: 'Trust lists' }));
    fireEvent.change(await screen.findByLabelText('Public key'), { target: { value: 'c'.repeat(64) } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Mutual aid group' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Known local organizer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add trusted key' }));

    await screen.findByText('Mutual aid group');
    await expect(db.allowlist.count()).resolves.toBe(1);
  });

  it('imports community allowlists and recomputes synced trust', async () => {
    const publicKey = 'f'.repeat(64);
    const listing: Listing = {
      id: 'listing_trust',
      authorPublicKey: publicKey,
      title: 'Trust import listing',
      type: 'offer',
      category: 'tutoring',
      description: 'Public synced listing.',
      region: 'Prague',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['cash'],
      barterAccepted: false,
      tags: ['math'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_4', kind: 'matrix', value: '@trust:matrix.org' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    await db.syncedListings.put({
      id: 'synced_trust_1',
      eventId: 'event_trust_1',
      kind: 30402,
      authorPublicKey: publicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: listing,
      trusted: false,
      hidden: false
    });

    renderAppAt('#settings');
    fireEvent.click(await screen.findByRole('tab', { name: 'Trust lists' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));

    const file = new File(
      [
        JSON.stringify({
          schemaVersion: 1,
          kind: 'community-allowlist',
          exportedAt: '2026-05-31T00:00:00.000Z',
          entries: [{ publicKey, label: 'Imported group', note: 'shared trust list' }]
        })
      ],
      'allowlist.json',
      { type: 'application/json' }
    );
    fireEvent.change(await screen.findByLabelText('Import community allowlist'), { target: { files: [file] } });

    expect(await screen.findByText('Imported group')).toBeInTheDocument();
    await waitFor(async () => expect((await db.syncedListings.get('synced_trust_1'))?.trusted).toBe(true));
  });
});
