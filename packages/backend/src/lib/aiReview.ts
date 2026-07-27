import { ReviewPosture } from '../repositories/types';

/**
 * Bounded AI review: prompt construction and response validation.
 *
 * The prompt is strictly bounded to one evidence document. Nothing else — no
 * control name, organisation, user, other controls, or prior interactions —
 * is ever included. Response validation is enforced here in the application
 * layer, never by trusting the model: a finding whose citation does not
 * appear verbatim in the evidence is discarded, and an assessment left with
 * no valid citation is downgraded to insufficient_evidence.
 */

/** The immutable core of the system prompt. No caller, setting or database
 * row can alter these rules. */
const CORE_RULES =
  'You are a compliance control reviewer. You will be given one piece of evidence submitted ' +
  'for a compliance control. Your task is to assess whether the evidence demonstrates that ' +
  'the control is in place. You must cite specific text from the evidence in your assessment. ' +
  "If the evidence does not contain sufficient information to make an assessment, you must " +
  "respond with the exact phrase 'INSUFFICIENT_EVIDENCE' and nothing else. You may not use " +
  'any knowledge outside the evidence provided. You may not invent citations.';

const OUTPUT_CONTRACT =
  'Respond with a single JSON object and nothing else, using exactly this shape: ' +
  '{"verdict": "satisfied" | "partially_satisfied" | "not_satisfied", ' +
  '"findings": [{"statement": "what the evidence shows", "citation": "text copied word-for-word from the evidence"}], ' +
  '"gaps": ["what the evidence does not establish"]}. ' +
  'Every citation must be an exact substring of the evidence — copy it character for character, ' +
  'do not paraphrase, summarise or correct it. Include at least one finding with a citation ' +
  'unless you are responding with INSUFFICIENT_EVIDENCE.';

/**
 * Posture fragments. The stored setting selects one of these constants by
 * key — the value is never interpolated into the prompt, so a tampered
 * database row cannot rewrite the reviewer's instructions. Each fragment
 * shapes tone and emphasis only; none can relax the core rules above.
 */
const POSTURE_FRAGMENTS: Record<ReviewPosture, string> = {
  balanced:
    'Weigh the evidence as a reasonable reviewer would: acknowledge what is genuinely ' +
    'demonstrated and name what is missing, without overstating either.',
  strict:
    'Apply a sceptical, audit-grade standard. Treat anything not explicitly evidenced as not ' +
    'demonstrated, and record every gap in coverage, corroboration or completeness you can ' +
    'identify from the evidence alone.',
  coaching:
    'Write for the person who submitted the evidence. Where something is missing, describe ' +
    'plainly what would need to be added to close the gap, while still only asserting what ' +
    'the evidence itself supports.',
};

export const REVIEW_POSTURES: ReviewPosture[] = ['balanced', 'strict', 'coaching'];

export const INSUFFICIENT_EVIDENCE_MARKER = 'INSUFFICIENT_EVIDENCE';

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  'The submitted evidence does not contain sufficient information to support an assessment.';

/** Builds the system prompt for a posture. An unrecognised posture falls back
 * to balanced rather than being interpolated — defence against a value that
 * somehow bypassed both the CHECK constraint and route validation. */
export function buildSystemPrompt(posture: ReviewPosture = 'balanced'): string {
  const fragment = POSTURE_FRAGMENTS[posture] ?? POSTURE_FRAGMENTS.balanced;
  return `${CORE_RULES} ${fragment} ${OUTPUT_CONTRACT}`;
}

/** Retained for callers and tests that only need the unmodified core prompt. */
export const AI_REVIEW_SYSTEM_PROMPT = buildSystemPrompt('balanced');

/** The single user message: the evidence document and nothing else. */
export function buildUserMessage(evidenceDocument: string): string {
  return `Evidence submitted for review: ${evidenceDocument}`;
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
export function hasValidCitation(evidenceDocument: string, response: string): boolean {
  return extractQuotedPhrases(response).some((phrase) => evidenceDocument.includes(phrase));
}

export type Verdict = 'satisfied' | 'partially_satisfied' | 'not_satisfied';

const VERDICTS: Verdict[] = ['satisfied', 'partially_satisfied', 'not_satisfied'];

export interface Finding {
  statement: string;
  citation: string;
}

export interface ClassifiedResponse {
  type: 'cited_assessment' | 'insufficient_evidence';
  citationsPresent: boolean;
  verdict: Verdict | null;
  findings: Finding[];
  gaps: string[];
  /** Validated citations, in the order they appear — the frontend highlights
   * exactly these spans in the evidence. Never persisted. */
  citations: string[];
}

const INSUFFICIENT: ClassifiedResponse = {
  type: 'insufficient_evidence',
  citationsPresent: false,
  verdict: null,
  findings: [],
  gaps: [],
  citations: [],
};

/** Strips markdown code fences some models wrap JSON in. */
function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

/**
 * Parses a structured response. Returns null when the payload is not usable
 * as JSON, so the caller can fall back to the prose path — model JSON
 * adherence varies by provider and a malformed reply must never surface as
 * an error to the reviewer.
 */
function parseStructured(
  evidenceDocument: string,
  response: string
): ClassifiedResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(response));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const payload = parsed as Record<string, unknown>;
  const rawFindings = Array.isArray(payload.findings) ? payload.findings : [];

  // The validation that matters: a finding survives only if its citation
  // appears verbatim in the evidence. Invented citations are dropped
  // silently — the model is never trusted to have quoted correctly.
  const findings: Finding[] = [];
  for (const item of rawFindings) {
    if (typeof item !== 'object' || item === null) continue;
    const { statement, citation } = item as Record<string, unknown>;
    if (typeof statement !== 'string' || typeof citation !== 'string') continue;
    const trimmedCitation = citation.trim();
    if (trimmedCitation === '' || !evidenceDocument.includes(trimmedCitation)) continue;
    findings.push({ statement: statement.trim(), citation: trimmedCitation });
  }

  if (findings.length === 0) return INSUFFICIENT;

  const verdict = VERDICTS.includes(payload.verdict as Verdict)
    ? (payload.verdict as Verdict)
    : null;

  return {
    type: 'cited_assessment',
    citationsPresent: true,
    verdict,
    findings,
    gaps: asStringArray(payload.gaps),
    citations: findings.map((f) => f.citation),
  };
}

/**
 * Classifies a raw model response.
 *
 * INSUFFICIENT_EVIDENCE anywhere in the response wins. Otherwise the
 * structured path is tried first, falling back to the prose path for models
 * that ignore the JSON contract. Either way the result must carry at least
 * one citation that appears verbatim in the evidence, or it is reported as
 * insufficient evidence.
 */
export function classifyResponse(
  evidenceDocument: string,
  response: string
): ClassifiedResponse {
  if (response.includes(INSUFFICIENT_EVIDENCE_MARKER)) return INSUFFICIENT;

  const structured = parseStructured(evidenceDocument, response);
  if (structured) return structured;

  // Prose fallback: treat the whole reply as one finding when it quotes the
  // evidence, so a non-conforming model still degrades usefully.
  const validQuotes = extractQuotedPhrases(response).filter((phrase) =>
    evidenceDocument.includes(phrase)
  );
  if (validQuotes.length === 0) return INSUFFICIENT;

  return {
    type: 'cited_assessment',
    citationsPresent: true,
    verdict: null,
    findings: [{ statement: response.trim(), citation: validQuotes[0]! }],
    gaps: [],
    citations: validQuotes,
  };
}
