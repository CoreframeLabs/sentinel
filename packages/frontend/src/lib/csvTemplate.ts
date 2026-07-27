import { ColumnMapping } from '../types';

/**
 * CSV import helpers: the canonical template, a realistic sample file, and
 * header auto-detection for the mapping step.
 *
 * These are conveniences for the person filling in the form — the server
 * re-validates every row on dry run and again on confirm, and never trusts a
 * mapping (or anything else) sent by the client.
 */

/** Canonical column headers. The downloadable template, the sample file and
 * the seeded mapping profiles all use these, so a saved profile applies
 * cleanly to a freshly downloaded template. */
export const TEMPLATE_HEADERS = ['Control Name', 'Description', 'Category', 'Due Date'] as const;

export interface FieldSpec {
  field: keyof ColumnMapping;
  header: string;
  label: string;
  required: boolean;
  rules: string;
  example: string;
}

/** Drives both the on-screen format table and the mapping form. */
export const FIELD_SPECS: FieldSpec[] = [
  {
    field: 'name',
    header: 'Control Name',
    label: 'Name',
    required: true,
    rules: '1–255 characters',
    example: 'Client due diligence files sampled',
  },
  {
    field: 'description',
    header: 'Description',
    label: 'Description',
    required: false,
    rules: 'Free text',
    example: 'Sample 10 client files for completeness of CDD records',
  },
  {
    field: 'category',
    header: 'Category',
    label: 'Category',
    required: false,
    rules: 'Free text',
    example: 'AML',
  },
  {
    field: 'due_date',
    header: 'Due Date',
    label: 'Due date',
    required: false,
    rules: 'YYYY-MM-DD, must be in the future',
    example: '2027-03-31',
  },
];

/* ------------------------------------------------------------------ */
/* Header auto-detection                                               */
/* ------------------------------------------------------------------ */

/** Lowercase and strip everything that isn't a letter or digit, so
 * "Due Date", "due_date" and "DueDate" all compare equal. */
function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: ['name', 'controlname', 'control', 'title', 'controltitle', 'requirement'],
  description: ['description', 'details', 'detail', 'notes', 'note', 'summary', 'guidance'],
  category: ['category', 'type', 'area', 'domain', 'theme', 'group', 'framework'],
  due_date: ['duedate', 'due', 'deadline', 'targetdate', 'datedue', 'nextreview'],
};

/**
 * Best-effort guess at which CSV column feeds which control field. Each
 * column is claimed by at most one field, and the user can always override
 * the result in the mapping form.
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const claimed = new Set<string>();

  for (const { field } of FIELD_SPECS) {
    const aliases = HEADER_ALIASES[field];
    const match = headers.find(
      (header) => !claimed.has(header) && aliases.includes(normalise(header))
    );
    if (match) {
      mapping[field] = match;
      claimed.add(match);
    }
  }
  return mapping;
}

/* ------------------------------------------------------------------ */
/* File generation                                                     */
/* ------------------------------------------------------------------ */

/** Quotes a value only when it needs it, matching common spreadsheet output. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

/** ISO date a given number of days from today, for sample due dates that
 * stay in the future however long this code lives. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Blank template: headers plus one example row showing the expected shape. */
export function buildTemplateCsv(): string {
  return toCsv([
    [...TEMPLATE_HEADERS],
    [
      'Client due diligence files sampled',
      'Sample 10 client files for completeness of CDD records',
      'AML',
      daysFromNow(90),
    ],
  ]);
}

/**
 * Realistic sample file. Three rows are deliberately invalid — one with no
 * name, one with a due date in the past, one with an unparseable date — so a
 * dry run demonstrates per-row rejection with specific reasons instead of a
 * uniform pass.
 */
export function buildSampleCsv(): string {
  return toCsv([
    [...TEMPLATE_HEADERS],
    ['Client care letters reviewed', 'Check engagement letters meet SRA transparency rules', 'Client care', daysFromNow(45)],
    ['Anti-money laundering policy refreshed', 'Annual refresh of the firm-wide AML policy', 'AML', daysFromNow(60)],
    ['File review programme scheduled', 'Plan the supervising partner file reviews for the year', 'Records', ''],
    ['Source of funds evidenced on high-risk matters', 'Confirm SoF recorded for all high-risk client matters', 'AML', daysFromNow(30)],
    ['Cyber awareness training completed', 'All staff complete the annual phishing module', 'Training', daysFromNow(75)],
    ['Client account reconciliation signed off', 'Monthly reconciliation under the SRA Accounts Rules', 'Client money', daysFromNow(14)],
    ['Professional indemnity cover confirmed', 'Evidence current PII certificate and limit', 'Governance', daysFromNow(120)],
    ['Disaster recovery contacts verified', 'Confirm the out-of-hours contact tree is current', 'Resilience', daysFromNow(100)],
    ['Data subject access request log reviewed', 'Check DSARs were answered within statutory deadlines', 'Records', daysFromNow(52)],
    ['', 'This row has no control name and will be rejected', 'Conduct', daysFromNow(40)],
    ['Cyber insurance renewal evidenced', 'This row has a due date in the past and will be rejected', 'Governance', '2020-01-01'],
    ['Sanctions screening spot check', 'This row has an unparseable due date and will be rejected', 'AML', 'next quarter'],
  ]);
}

/** Triggers a browser download of an in-memory CSV. Nothing is uploaded. */
export function downloadCsv(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
