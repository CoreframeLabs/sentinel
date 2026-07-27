import { AssignmentRow } from '../repositories/types';

/**
 * Evidence document composition.
 *
 * An assignment's evidence is a narrative summary plus the structured facts
 * an auditor records around it: how the control was tested, the period
 * covered, the sample examined, and where the underlying record is filed.
 *
 * composeEvidenceDocument renders those into one canonical block of text.
 * This is deliberately the *single* source used both for the bounded AI
 * prompt and for the text the reviewer sees highlighted — if the two could
 * diverge, a citation could be validated against text the user never saw.
 */

export const EVIDENCE_METHODS = ['inspection', 'observation', 'inquiry', 'reperformance'] as const;
export type EvidenceMethod = (typeof EVIDENCE_METHODS)[number];

/** How each method reads in the composed document and in the UI. */
export const EVIDENCE_METHOD_LABELS: Record<EvidenceMethod, string> = {
  inspection: 'Inspection of records',
  observation: 'Observation of the process',
  inquiry: 'Inquiry of personnel',
  reperformance: 'Re-performance of the control',
};

export interface EvidenceInput {
  summary: string;
  method?: EvidenceMethod | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  sampleSize?: number | null;
  population?: number | null;
  location?: string | null;
}

/** Reads the structured evidence off an assignment row. */
export function evidenceFromAssignment(assignment: AssignmentRow): EvidenceInput | null {
  if (!assignment.evidence_note) return null;
  return {
    summary: assignment.evidence_note,
    method: assignment.evidence_method,
    periodStart: assignment.evidence_period_start,
    periodEnd: assignment.evidence_period_end,
    sampleSize: assignment.evidence_sample_size,
    population: assignment.evidence_population,
    location: assignment.evidence_location,
  };
}

/**
 * Renders evidence as one text block. Only fields that were filled in appear,
 * so a narrative-only record still composes cleanly and the AI is never shown
 * placeholder text it could mistake for evidence.
 */
export function composeEvidenceDocument(evidence: EvidenceInput): string {
  const lines: string[] = [];

  if (evidence.method) {
    lines.push(`Method: ${EVIDENCE_METHOD_LABELS[evidence.method]}.`);
  }
  if (evidence.periodStart && evidence.periodEnd) {
    lines.push(`Period covered: ${evidence.periodStart} to ${evidence.periodEnd}.`);
  } else if (evidence.periodStart) {
    lines.push(`Period covered: from ${evidence.periodStart}.`);
  } else if (evidence.periodEnd) {
    lines.push(`Period covered: up to ${evidence.periodEnd}.`);
  }
  // Explicit null/undefined checks: a sample size of 0 is meaningful
  // evidence ("nothing to examine") and must not be treated as absent.
  const hasSample = evidence.sampleSize !== null && evidence.sampleSize !== undefined;
  const hasPopulation = evidence.population !== null && evidence.population !== undefined;
  if (hasSample && hasPopulation) {
    lines.push(`Sample: ${evidence.sampleSize} of ${evidence.population} items examined.`);
  } else if (hasSample) {
    lines.push(`Sample: ${evidence.sampleSize} items examined.`);
  }
  if (evidence.location) {
    lines.push(`Records filed at: ${evidence.location}.`);
  }

  lines.push(evidence.summary);
  return lines.join('\n');
}
