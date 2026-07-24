/**
 * Bounded AI review: prompt construction and response validation.
 *
 * The prompt is strictly bounded to one evidence note. Nothing else — no
 * control name, organisation, user, other controls, or prior interactions —
 * is ever included. Response validation is enforced here in the application
 * layer, never by trusting the model: an assessment without at least one
 * verbatim citation from the evidence is downgraded to insufficient_evidence.
 */

export const AI_REVIEW_SYSTEM_PROMPT =
  'You are a compliance control reviewer. You will be given one piece of evidence submitted ' +
  'for a compliance control. Your task is to assess whether the evidence demonstrates that ' +
  'the control is in place. You must cite specific text from the evidence in your assessment. ' +
  "If the evidence does not contain sufficient information to make an assessment, you must " +
  "respond with the exact phrase 'INSUFFICIENT_EVIDENCE' and nothing else. You may not use " +
  'any knowledge outside the evidence provided. You may not invent citations.';

export const INSUFFICIENT_EVIDENCE_MARKER = 'INSUFFICIENT_EVIDENCE';

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  'The submitted evidence does not contain sufficient information to support an assessment.';

/** The single user message: the evidence note and nothing else. */
export function buildUserMessage(evidenceNote: string): string {
  return `Evidence submitted for review: ${evidenceNote}`;
}

// Straight and typographic double quotes; a citation is whatever the model
// wrapped in a matching pair.
const QUOTED_PHRASE_RE = /"([^"]+)"|“([^”]+)”/g;

/** Extracts every quoted phrase from a model response. */
export function extractQuotedPhrases(response: string): string[] {
  const phrases: string[] = [];
  for (const match of response.matchAll(QUOTED_PHRASE_RE)) {
    const phrase = (match[1] ?? match[2] ?? '').trim();
    if (phrase !== '') phrases.push(phrase);
  }
  return phrases;
}

/**
 * True when the response contains at least one quoted phrase that appears
 * verbatim in the evidence. A quote the evidence does not contain is an
 * invented citation and does not count.
 */
export function hasValidCitation(evidenceNote: string, response: string): boolean {
  return extractQuotedPhrases(response).some((phrase) => evidenceNote.includes(phrase));
}

export interface ClassifiedResponse {
  type: 'cited_assessment' | 'insufficient_evidence';
  citationsPresent: boolean;
  /** The assessment text to return to the manager — only for cited
   * assessments; never persisted. */
  assessment: string | null;
}

/**
 * Classifies a raw model response. INSUFFICIENT_EVIDENCE anywhere in the
 * response wins; otherwise the response must carry at least one valid
 * citation or it is treated as insufficient evidence.
 */
export function classifyResponse(evidenceNote: string, response: string): ClassifiedResponse {
  if (response.includes(INSUFFICIENT_EVIDENCE_MARKER)) {
    return { type: 'insufficient_evidence', citationsPresent: false, assessment: null };
  }
  if (!hasValidCitation(evidenceNote, response)) {
    return { type: 'insufficient_evidence', citationsPresent: false, assessment: null };
  }
  return { type: 'cited_assessment', citationsPresent: true, assessment: response };
}
