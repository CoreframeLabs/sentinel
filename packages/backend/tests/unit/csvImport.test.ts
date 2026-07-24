import crypto from 'crypto';
import {
  CsvMappingError,
  CsvParseError,
  fileChecksum,
  parseCsv,
  resolveMapping,
  rowChecksum,
  validateRows,
} from '../../src/lib/csvImport';

const TODAY = '2026-07-24';

const MAPPING = {
  name: 'Control Name',
  description: 'Details',
  category: 'Category',
  due_date: 'Due Date',
};

function csv(...lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

describe('parseCsv', () => {
  it('parses headers and rows, handling quoted fields', () => {
    const parsed = parseCsv(
      csv('Control Name,Details', '"Access, review","Quarterly ""deep"" check"')
    );
    expect(parsed.headers).toEqual(['Control Name', 'Details']);
    expect(parsed.rows).toEqual([['Access, review', 'Quarterly "deep" check']]);
  });

  it('rejects an empty file', () => {
    expect(() => parseCsv(Buffer.from(''))).toThrow(CsvParseError);
  });
});

describe('resolveMapping', () => {
  it('requires the name field to be mapped', () => {
    expect(() => resolveMapping(['A'], { name: undefined as unknown as string })).toThrow(
      CsvMappingError
    );
  });

  it('rejects a mapping that names a missing column', () => {
    expect(() => resolveMapping(['A'], { name: 'Nope' })).toThrow(CsvMappingError);
  });
});

describe('validateRows', () => {
  const parsed = parseCsv(
    csv(
      'Control Name,Details,Category,Due Date',
      'Access review,Quarterly review,Security,2027-01-15',
      ',Missing name,Ops,2027-01-15',
      `${'x'.repeat(256)},Too long,,`,
      'Past due,,,2020-01-01',
      'Bad date,,,tomorrow',
      'Minimal,,,'
    )
  );

  const summary = validateRows(parsed, MAPPING, TODAY);

  it('splits accepted and rejected rows and discards nothing', () => {
    expect(summary.totalRows).toBe(6);
    expect(summary.acceptedRows).toBe(2);
    expect(summary.rejectedRows).toBe(4);
    expect(summary.rows).toHaveLength(6);
  });

  it('gives each rejected row a specific reason', () => {
    const reasons = new Map(
      summary.rows.filter((r) => r.status === 'rejected').map((r) => [r.rowNumber, r.rejectionReason])
    );
    expect(reasons.get(2)).toBe('name is empty');
    expect(reasons.get(3)).toBe('name exceeds 255 characters');
    expect(reasons.get(4)).toBe('due_date is not a future date');
    expect(reasons.get(5)).toBe('due_date is not a valid date (expected YYYY-MM-DD)');
  });

  it('maps accepted rows onto control fields', () => {
    const first = summary.rows[0]!;
    expect(first.status).toBe('accepted');
    expect(first.control).toEqual({
      name: 'Access review',
      description: 'Quarterly review',
      category: 'Security',
      dueDate: '2027-01-15',
    });
    const minimal = summary.rows[5]!;
    expect(minimal.control).toEqual({
      name: 'Minimal',
      description: '',
      category: null,
      dueDate: null,
    });
  });

  it('rejects impossible calendar dates', () => {
    const bad = validateRows(
      parseCsv(csv('Control Name,Due Date', 'A,2027-02-30')),
      { name: 'Control Name', due_date: 'Due Date' },
      TODAY
    );
    expect(bad.rows[0]!.rejectionReason).toBe('due_date is not a valid date (expected YYYY-MM-DD)');
  });

  it('computes the row checksum over the raw values joined by comma', () => {
    const row = summary.rows[0]!;
    const expected = crypto
      .createHash('sha256')
      .update(['Access review', 'Quarterly review', 'Security', '2027-01-15'].join(','))
      .digest('hex');
    expect(row.checksum).toBe(expected);
    expect(rowChecksum(row.values)).toBe(expected);
  });
});

describe('fileChecksum', () => {
  it('is the SHA-256 of the file bytes', () => {
    const file = csv('a,b', '1,2');
    expect(fileChecksum(file)).toBe(crypto.createHash('sha256').update(file).digest('hex'));
  });
});
