import { safeCompare } from '../../src/lib/safeCompare';

describe('safeCompare (constant-time comparison)', () => {
  it('returns true for identical strings', () => {
    expect(safeCompare('secret-token-value', 'secret-token-value')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(safeCompare('secret-token-value', 'secret-token-valuX')).toBe(false);
  });

  it('returns false for different lengths without throwing', () => {
    expect(safeCompare('short', 'a-much-longer-value')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(safeCompare('', '')).toBe(true);
    expect(safeCompare('', 'x')).toBe(false);
  });

  it('is byte-exact for unicode input', () => {
    expect(safeCompare('töken', 'töken')).toBe(true);
    expect(safeCompare('töken', 'token')).toBe(false);
  });
});
