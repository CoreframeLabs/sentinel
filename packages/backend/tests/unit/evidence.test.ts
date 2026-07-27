import { composeEvidenceDocument } from '../../src/lib/evidence';

describe('composeEvidenceDocument', () => {
  const summary = 'Sampled 10 client files; all held certified ID.';

  it('renders every structured field ahead of the summary', () => {
    const doc = composeEvidenceDocument({
      summary,
      method: 'inspection',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      sampleSize: 10,
      population: 41,
      location: 'Compliance/2026/Q2.xlsx',
    });
    expect(doc).toBe(
      [
        'Method: Inspection of records.',
        'Period covered: 2026-04-01 to 2026-06-30.',
        'Sample: 10 of 41 items examined.',
        'Records filed at: Compliance/2026/Q2.xlsx.',
        summary,
      ].join('\n')
    );
  });

  it('omits fields that were not filled in', () => {
    expect(composeEvidenceDocument({ summary })).toBe(summary);
  });

  it('handles a half-open period', () => {
    expect(composeEvidenceDocument({ summary, periodStart: '2026-04-01' })).toContain(
      'Period covered: from 2026-04-01.'
    );
    expect(composeEvidenceDocument({ summary, periodEnd: '2026-06-30' })).toContain(
      'Period covered: up to 2026-06-30.'
    );
  });

  it('renders a sample size without a population', () => {
    expect(composeEvidenceDocument({ summary, sampleSize: 10 })).toContain(
      'Sample: 10 items examined.'
    );
  });

  it('keeps a zero sample size rather than treating it as absent', () => {
    expect(composeEvidenceDocument({ summary, sampleSize: 0, population: 41 })).toContain(
      'Sample: 0 of 41 items examined.'
    );
  });

  it('always ends with the summary, so the narrative is never truncated away', () => {
    const doc = composeEvidenceDocument({ summary, method: 'inquiry' });
    expect(doc.endsWith(summary)).toBe(true);
  });
});
