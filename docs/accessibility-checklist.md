# Accessibility Checklist

Use this checklist before tagging a production release. Automated tests cover regressions, but they do not replace manual assistive-technology review.

## Keyboard And Focus

- Navigate Home, Marketplace, listing pages, Profile, Mediators, Trade, Reputation, and Settings using only the keyboard.
- Confirm the skip link moves focus to the main content.
- Confirm every tablist, disclosure, file input, publish button, import button, and destructive action is reachable.
- Confirm visible focus styles are not clipped by cards, sticky sections, or scroll containers.
- Confirm arrow keys switch workspace tabs where tablists are used.

## Screen Reader Semantics

- Confirm each page has one clear main landmark and active navigation uses `aria-current`.
- Confirm tablists have meaningful names, active tabs announce selected state, and disclosures announce expanded/collapsed state.
- Confirm repeated listing, reputation, synced-cache, and review-queue actions have enough nearby context to understand the target record.
- Confirm status messages for save, publish, import, reject, upload, signing, backup, and delete actions are announced.

## Forms And Files

- Confirm all form controls have visible labels or screen-reader labels.
- Confirm disabled controls explain why they are disabled, especially publish, encrypted publish, reputation signing, receipt signing, review import, Blossom upload, and backup actions.
- Confirm file inputs for backups, dispute bundles, allowlists, and Blossom images are keyboard-accessible.
- Confirm errors and safety notices are close to the risky action they describe.

## Visual And Motion

- Check contrast for text, muted text, badges, warnings, and focus outlines.
- Test Marketplace cards, listing item pages, Create Listing, Reputation, Trade, and Settings at mobile, tablet, and desktop widths.
- Confirm public keys, hashes, URLs, payment URIs, tags, badges, and action rows wrap without horizontal overflow.
- Confirm reduced-motion mode does not rely on animation to reveal important content.

## Security-Critical Copy

- Confirm public publish, encrypted publish, plaintext dispute export, allowlist import, delete-all, Blossom upload, signer connect, and reputation publish still show safety context.
- Confirm UI copy does not imply AgoraMesh verifies identity, guarantees relay delivery, provides escrow, executes payments, moderates relays, or auto-imports public data.
