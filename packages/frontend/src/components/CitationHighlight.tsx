import { Fragment, useMemo } from 'react';

/**
 * Renders the reviewed evidence with every validated citation highlighted.
 *
 * The citations arrive already verified server-side — each one is a verbatim
 * substring of this exact text. Highlighting them is what makes the citation
 * enforcement visible: a reviewer can see which words the model actually
 * quoted, and which parts of the evidence it ignored.
 */
export function CitationHighlight({
  text,
  citations,
}: {
  text: string;
  citations: string[];
}) {
  const segments = useMemo(() => buildSegments(text, citations), [text, citations]);

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
      {segments.map((segment, i) => (
        <Fragment key={i}>
          {segment.cited ? (
            <mark className="rounded bg-amber-100 px-0.5 text-slate-900 ring-1 ring-inset ring-amber-300">
              {segment.text}
            </mark>
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </p>
  );
}

interface Segment {
  text: string;
  cited: boolean;
}

/**
 * Splits the text into cited and uncited runs. Matches are taken in document
 * order and overlaps are skipped, so two citations sharing a span cannot
 * produce nested or duplicated output.
 */
function buildSegments(text: string, citations: string[]): Segment[] {
  const ranges: { start: number; end: number }[] = [];

  for (const citation of citations) {
    if (!citation) continue;
    // A citation may legitimately appear more than once; mark every
    // occurrence rather than only the first.
    let from = 0;
    for (;;) {
      const start = text.indexOf(citation, from);
      if (start === -1) break;
      ranges.push({ start, end: start + citation.length });
      from = start + citation.length;
    }
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start < last.end) {
      // Overlapping: extend the existing highlight rather than nesting.
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), cited: false });
    }
    segments.push({ text: text.slice(range.start, range.end), cited: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), cited: false });
  }
  return segments;
}
