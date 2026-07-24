import {
  classifyResponse,
  extractQuotedPhrases,
  hasValidCitation,
} from '../../src/lib/aiReview';

const EVIDENCE =
  'The access review was completed on 12 June and the results were archived in the compliance drive.';

describe('extractQuotedPhrases', () => {
  it('extracts straight and typographic double quotes', () => {
    expect(
      extractQuotedPhrases('It says "archived in the compliance drive" and “completed on 12 June”.')
    ).toEqual(['archived in the compliance drive', 'completed on 12 June']);
  });

  it('returns nothing for unquoted text', () => {
    expect(extractQuotedPhrases('No citations here.')).toEqual([]);
  });
});

describe('hasValidCitation', () => {
  it('accepts a quote that appears verbatim in the evidence', () => {
    expect(hasValidCitation(EVIDENCE, 'The note "completed on 12 June" shows this.')).toBe(true);
  });

  it('rejects an invented quote', () => {
    expect(hasValidCitation(EVIDENCE, 'The note "signed off by the CFO" shows this.')).toBe(false);
  });

  it('rejects quotes that only partially match', () => {
    expect(hasValidCitation(EVIDENCE, '"completed on 13 June" it says.')).toBe(false);
  });
});

describe('classifyResponse', () => {
  it('classifies an INSUFFICIENT_EVIDENCE response', () => {
    const result = classifyResponse(EVIDENCE, 'INSUFFICIENT_EVIDENCE');
    expect(result).toEqual({
      type: 'insufficient_evidence',
      citationsPresent: false,
      assessment: null,
    });
  });

  it('INSUFFICIENT_EVIDENCE wins even when quotes are present', () => {
    const result = classifyResponse(EVIDENCE, 'INSUFFICIENT_EVIDENCE "completed on 12 June"');
    expect(result.type).toBe('insufficient_evidence');
  });

  it('classifies a response with a valid citation as a cited assessment', () => {
    const response =
      'The evidence demonstrates the control: "archived in the compliance drive" confirms retention.';
    const result = classifyResponse(EVIDENCE, response);
    expect(result).toEqual({
      type: 'cited_assessment',
      citationsPresent: true,
      assessment: response,
    });
  });

  it('downgrades a response without any valid citation to insufficient evidence', () => {
    const result = classifyResponse(
      EVIDENCE,
      'This control is clearly in place because "the CFO signed it off".'
    );
    expect(result).toEqual({
      type: 'insufficient_evidence',
      citationsPresent: false,
      assessment: null,
    });
  });

  it('downgrades a response with no quotes at all', () => {
    expect(classifyResponse(EVIDENCE, 'Looks fine to me.').type).toBe('insufficient_evidence');
  });
});
