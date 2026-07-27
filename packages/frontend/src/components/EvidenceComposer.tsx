import { useMemo, useState } from 'react';
import { Send, Save } from 'lucide-react';
import { Assignment, EvidenceDraft, EvidenceMethod } from '../types';
import { Button, inputClass } from './ui';

/**
 * Structured evidence capture: the narrative summary plus the facts an
 * auditor records around it. The completeness meter is guidance only — the
 * server accepts a narrative-only record — but a fuller record produces
 * better AI review, because there is more specific text to cite.
 */

const METHODS: { value: EvidenceMethod; label: string }[] = [
  { value: 'inspection', label: 'Inspection of records' },
  { value: 'observation', label: 'Observation of the process' },
  { value: 'inquiry', label: 'Inquiry of personnel' },
  { value: 'reperformance', label: 'Re-performance of the control' },
];

export function emptyDraft(assignment: Assignment): EvidenceDraft {
  return {
    evidenceNote: assignment.evidence_note ?? '',
    method: assignment.evidence_method ?? '',
    periodStart: assignment.evidence_period_start ?? '',
    periodEnd: assignment.evidence_period_end ?? '',
    sampleSize: assignment.evidence_sample_size?.toString() ?? '',
    population: assignment.evidence_population?.toString() ?? '',
    location: assignment.evidence_location ?? '',
  };
}

/** Converts the form's string fields into the API payload. */
export function draftToPayload(draft: EvidenceDraft): Record<string, unknown> {
  const toNumber = (value: string) => (value.trim() === '' ? null : Number(value));
  return {
    evidenceNote: draft.evidenceNote.trim(),
    method: draft.method || null,
    periodStart: draft.periodStart || null,
    periodEnd: draft.periodEnd || null,
    sampleSize: toNumber(draft.sampleSize),
    population: toNumber(draft.population),
    location: draft.location.trim() || null,
  };
}

interface Check {
  done: boolean;
  hint: string;
}

/** Completeness signals, in the order a reviewer would look for them. */
function completeness(draft: EvidenceDraft): { checks: Check[]; percent: number } {
  const checks: Check[] = [
    {
      done: draft.evidenceNote.trim().length >= 40,
      hint: 'Describe what you checked in a sentence or two',
    },
    { done: draft.method !== '', hint: 'Say how the control was tested' },
    {
      done: draft.periodStart !== '' && draft.periodEnd !== '',
      hint: 'Give the period the evidence covers',
    },
    { done: draft.sampleSize !== '', hint: 'Record how many items you examined' },
    { done: draft.location.trim() !== '', hint: 'Note where the record is filed' },
  ];
  const done = checks.filter((c) => c.done).length;
  return { checks, percent: Math.round((done / checks.length) * 100) };
}

export function EvidenceComposer({
  draft,
  onChange,
  onSave,
  onSubmit,
  busy,
  canSubmit,
}: {
  draft: EvidenceDraft;
  onChange: (draft: EvidenceDraft) => void;
  onSave: () => void;
  onSubmit: () => void;
  busy: boolean;
  canSubmit: boolean;
}) {
  const [showGuidance, setShowGuidance] = useState(false);
  const { checks, percent } = useMemo(() => completeness(draft), [draft]);
  const set = <K extends keyof EvidenceDraft>(key: K, value: EvidenceDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const hasSummary = draft.evidenceNote.trim() !== '';
  const meterTone =
    percent >= 80 ? 'bg-emerald-500' : percent >= 40 ? 'bg-amber-500' : 'bg-slate-400';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">What did you check?</span>
        <textarea
          rows={3}
          placeholder="e.g. Sampled 10 client files opened this quarter. All 10 held certified ID; two were missing a risk assessment, remediated on 14 July."
          className={`mt-1.5 ${inputClass}`}
          value={draft.evidenceNote}
          onChange={(e) => set('evidenceNote', e.target.value)}
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">How was it tested?</span>
          <select
            className={`mt-1.5 ${inputClass}`}
            value={draft.method}
            onChange={(e) => set('method', e.target.value as EvidenceMethod | '')}
          >
            <option value="">Not stated</option>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Where is it filed?</span>
          <input
            type="text"
            placeholder="System and reference"
            className={`mt-1.5 ${inputClass}`}
            value={draft.location}
            onChange={(e) => set('location', e.target.value)}
          />
        </label>

        <fieldset className="text-sm">
          <legend className="font-medium text-slate-700">Period covered</legend>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="date"
              aria-label="Period start"
              className={inputClass}
              value={draft.periodStart}
              onChange={(e) => set('periodStart', e.target.value)}
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              aria-label="Period end"
              className={inputClass}
              value={draft.periodEnd}
              onChange={(e) => set('periodEnd', e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="text-sm">
          <legend className="font-medium text-slate-700">Sample examined</legend>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={0}
              aria-label="Sample size"
              placeholder="10"
              className={inputClass}
              value={draft.sampleSize}
              onChange={(e) => set('sampleSize', e.target.value)}
            />
            <span className="text-xs text-slate-400">of</span>
            <input
              type="number"
              min={0}
              aria-label="Population"
              placeholder="41"
              className={inputClass}
              value={draft.population}
              onChange={(e) => set('population', e.target.value)}
            />
          </div>
        </fieldset>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={() => setShowGuidance((s) => !s)}
          aria-expanded={showGuidance}
        >
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <span
              className={`block h-full rounded-full transition-all ${meterTone}`}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="shrink-0 text-xs font-medium text-slate-500">
            {percent}% complete
          </span>
        </button>
        {showGuidance ? (
          <ul className="mt-2.5 space-y-1">
            {checks.map((check) => (
              <li
                key={check.hint}
                className={`text-xs ${check.done ? 'text-emerald-700' : 'text-slate-500'}`}
              >
                {check.done ? '✓' : '○'} {check.hint}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">
            {percent === 100
              ? 'Complete record — this gives a reviewer everything they need.'
              : checks.find((c) => !c.done)?.hint}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy || !hasSummary} onClick={onSave}>
          <Save className="h-4 w-4" /> Save draft
        </Button>
        <Button disabled={busy || !canSubmit} onClick={onSubmit}>
          <Send className="h-4 w-4" /> Submit for review
        </Button>
      </div>
    </div>
  );
}
