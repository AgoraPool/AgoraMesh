import { describe, expect, it } from 'vitest';
import { operatorSupportConfig } from './operatorSupport';

describe('operator support config', () => {
  it('defaults to disabled with a 5000 sat minimum', () => {
    expect(operatorSupportConfig({})).toEqual({
      enabled: false,
      lnurl: '',
      minimumSats: 5000,
      label: 'AgoraMesh'
    });
  });

  it('reads public build config when present', () => {
    expect(
      operatorSupportConfig({
        VITE_AGORAMESH_OPERATOR_LNURL: 'lnurl1operator',
        VITE_AGORAMESH_OPERATOR_SUPPORT_MIN_SATS: '7500',
        VITE_AGORAMESH_OPERATOR_LABEL: 'Operator'
      })
    ).toEqual({
      enabled: true,
      lnurl: 'lnurl1operator',
      minimumSats: 7500,
      label: 'Operator'
    });
  });

  it('accepts a Lightning address without requiring an LNURL value', () => {
    expect(
      operatorSupportConfig({
        VITE_AGORAMESH_OPERATOR_LIGHTNING_ADDRESS: 'operator@example.com'
      })
    ).toEqual({
      enabled: true,
      lnurl: 'operator@example.com',
      minimumSats: 5000,
      label: 'AgoraMesh'
    });
  });

  it('prefers the explicit LNURL target when both payment targets are configured', () => {
    expect(
      operatorSupportConfig({
        VITE_AGORAMESH_OPERATOR_LIGHTNING_ADDRESS: 'operator@example.com',
        VITE_AGORAMESH_OPERATOR_LNURL: 'lnurl1operator'
      }).lnurl
    ).toBe('lnurl1operator');
  });

  it('keeps a safe minimum when config is malformed', () => {
    expect(
      operatorSupportConfig({
        VITE_AGORAMESH_OPERATOR_LNURL: 'lnurl1operator',
        VITE_AGORAMESH_OPERATOR_SUPPORT_MIN_SATS: '0'
      }).minimumSats
    ).toBe(5000);
  });
});
