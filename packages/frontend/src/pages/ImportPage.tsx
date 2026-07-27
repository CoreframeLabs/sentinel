import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, History, Upload, XCircle } from 'lucide-react';
import { api, apiUpload, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/toast';
import {
  ColumnMapping,
  DryRunResult,
  ImportProfile,
  ImportRowResult,
  ImportRun,
  ParseResult,
} from '../types';
import { Button, Card, EmptyState, inputClass, PageHeader } from '../components/ui';
import { formatDate } from '../lib/format';
import {
  FIELD_SPECS,
  autoDetectMapping,
  buildSampleCsv,
  buildTemplateCsv,
  downloadCsv,
} from '../lib/csvTemplate';

type Step = 'upload' | 'map' | 'review' | 'done';

export function ImportPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [profiles, setProfiles] = useState<ImportProfile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [profileName, setProfileName] = useState('');
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [importRun, setImportRun] = useState<ImportRun | null>(null);
  const [busy, setBusy] = useState(false);
  /** True when the mapping was guessed from the headers rather than chosen,
   * so the form can say so instead of looking like the user's own input. */
  const [mappingAutoDetected, setMappingAutoDetected] = useState(false);

  const loadProfiles = useCallback(() => {
    void api<{ profiles: ImportProfile[] }>('/api/import-profiles').then((res) =>
      setProfiles(res.profiles)
    );
  }, []);

  useEffect(loadProfiles, [loadProfiles]);

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : 'Something went wrong');

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', chosen);
      const result = await apiUpload<ParseResult>('/api/imports/parse', form);
      const detected = autoDetectMapping(result.headers);
      setFile(chosen);
      setParsed(result);
      setMapping(detected);
      setMappingAutoDetected(Object.keys(detected).length > 0);
      setProfileId('');
      setDryRun(null);
      setStep('map');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const applyProfile = (id: string) => {
    setProfileId(id);
    const profile = profiles.find((p) => p.id === id);
    if (profile) {
      setMapping(profile.column_mapping);
      setMappingAutoDetected(false);
    }
  };

  const saveProfile = async () => {
    if (!profileName.trim() || !mapping.name) return;
    setBusy(true);
    try {
      const res = await api<{ profile: ImportProfile }>('/api/import-profiles', {
        method: 'POST',
        body: { name: profileName.trim(), mapping },
      });
      toast.success('Mapping profile saved.');
      setProfileName('');
      setProfileId(res.profile.id);
      loadProfiles();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const importForm = (): FormData | null => {
    if (!file) return null;
    const form = new FormData();
    form.append('file', file);
    form.append('mapping', JSON.stringify(mapping));
    if (profileId) form.append('profileId', profileId);
    return form;
  };

  const runDryRun = async () => {
    const form = importForm();
    if (!form) return;
    setBusy(true);
    try {
      setDryRun(await apiUpload<DryRunResult>('/api/imports/dry-run', form));
      setStep('review');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    const form = importForm();
    if (!form) return;
    setBusy(true);
    try {
      const res = await apiUpload<{ importRun: ImportRun }>('/api/imports/confirm', form);
      setImportRun(res.importRun);
      setStep('done');
      toast.success('Import completed.');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setParsed(null);
    setMapping({});
    setProfileId('');
    setDryRun(null);
    setImportRun(null);
  };

  return (
    <div className="fade-in space-y-6">
      <PageHeader
        title="Import controls"
        subtitle="Upload a CSV of compliance controls. Every row is validated, and every outcome — accepted or rejected — is recorded with its checksum."
        infoTitle="How importing works"
        info={
          <>
            <p>
              Four steps: <strong>1.</strong> Upload a CSV (max 5MB) with a header row.{' '}
              <strong>2.</strong> Map its columns to control fields — only Name is required —
              and optionally save the mapping as a profile to reuse next time.{' '}
              <strong>3.</strong> Run the dry run: nothing is written yet; you see exactly which
              rows would be accepted and why the rest were rejected. <strong>4.</strong> Confirm
              to create the accepted controls.
            </p>
            <p>
              Rows are rejected when the name is empty or over 255 characters, or a due date is
              not a future YYYY-MM-DD date. Rejected rows are never silently dropped — each is
              recorded with its reason in the history below, alongside checksums that let you
              prove later what was imported. The file itself is never stored.
            </p>
          </>
        }
      />

      {step === 'upload' ? (
        <Card title="Step 1 — Upload CSV">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-10 text-center hover:border-indigo-400">
            <Upload className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {busy ? 'Parsing…' : 'Choose a CSV file (max 5MB)'}
            </span>
            <span className="text-xs text-slate-500">
              The file is parsed in memory and never stored — only its checksum is kept.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => void onFileChosen(e)}
            />
          </label>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Not sure what the file should look like?
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Start from the template, or try the sample — it deliberately contains a few
                  invalid rows so you can see how they are reported.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadCsv('sentinel-control-template.csv', buildTemplateCsv())}
                >
                  <Download className="h-4 w-4" /> Blank template
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadCsv('sentinel-sample-controls.csv', buildSampleCsv())}
                >
                  <Download className="h-4 w-4" /> Sample data
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Column</th>
                    <th className="px-3 py-2 font-semibold">Required</th>
                    <th className="px-3 py-2 font-semibold">Rules</th>
                    <th className="px-3 py-2 font-semibold">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {FIELD_SPECS.map((spec) => (
                    <tr key={spec.field}>
                      <td className="px-3 py-2 font-medium text-slate-900">{spec.header}</td>
                      <td className="px-3 py-2">
                        {spec.required ? (
                          <span className="font-medium text-rose-700">Yes</span>
                        ) : (
                          <span className="text-slate-500">Optional</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{spec.rules}</td>
                      <td className="px-3 py-2 text-slate-500">{spec.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              The first row must be column headers. Your headers can differ from these — you map
              them in the next step, and any extra columns are ignored.
            </p>
          </div>
        </Card>
      ) : null}

      {step === 'map' && parsed ? (
        <>
          <Card title={`Preview — first ${parsed.preview.length} of ${parsed.totalRows} rows`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    {parsed.headers.map((h) => (
                      <th key={h} className="py-2 pr-4 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.preview.map((row, i) => (
                    <tr key={i}>
                      {parsed.headers.map((_, j) => (
                        <td key={j} className="py-2 pr-4 text-slate-600">
                          {row[j] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Step 2 — Map columns">
            {mappingAutoDetected ? (
              <p className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-slate-600">
                We matched your column headers automatically — check them below and adjust
                anything we guessed wrong.
              </p>
            ) : null}
            {profiles.length > 0 ? (
              <label className="mb-4 block text-sm">
                <span className="font-medium text-slate-700">Load a saved profile</span>
                <select
                  className={`mt-1.5 ${inputClass}`}
                  value={profileId}
                  onChange={(e) => applyProfile(e.target.value)}
                >
                  <option value="">Start from scratch…</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {FIELD_SPECS.map(({ field, label, required, rules }) => (
                <label key={field} className="block text-sm">
                  <span className="font-medium text-slate-700">
                    {label}
                    {required ? <span className="text-rose-600"> *</span> : null}
                  </span>
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{rules}</span>
                  <select
                    className={`mt-1.5 ${inputClass}`}
                    value={mapping[field] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMapping((m) => ({ ...m, [field]: value || undefined }));
                      setMappingAutoDetected(false);
                    }}
                  >
                    <option value="">{required ? 'Select a column…' : 'Not imported'}</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="flex items-end gap-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Save mapping as profile</span>
                  <input
                    type="text"
                    placeholder="e.g. Standard risk register"
                    className={`mt-1.5 ${inputClass}`}
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={busy || !profileName.trim() || !mapping.name}
                  onClick={() => void saveProfile()}
                >
                  Save profile
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={reset}>
                  Start over
                </Button>
                <Button disabled={busy || !mapping.name} onClick={() => void runDryRun()}>
                  {busy ? 'Validating…' : 'Run validation (dry run)'}
                </Button>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {step === 'review' && dryRun ? (
        <Card title="Step 3 — Dry run results">
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="text-slate-600">
              Total rows: <strong className="text-slate-900">{dryRun.totalRows}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Accepted:{' '}
              <strong>{dryRun.acceptedRows}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-700">
              <XCircle className="h-4 w-4" /> Rejected: <strong>{dryRun.rejectedRows}</strong>
            </span>
          </div>

          {dryRun.acceptedPreview.length > 0 ? (
            <div className="mb-4 overflow-x-auto rounded-lg border border-emerald-100">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-emerald-100 bg-emerald-50 text-xs uppercase tracking-wide text-emerald-800">
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Control to create</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Due date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dryRun.acceptedPreview.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-2 font-medium text-slate-900">{r.rowNumber}</td>
                      <td className="px-3 py-2 text-slate-700">{r.name}</td>
                      <td className="px-3 py-2 text-slate-500">{r.category ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{r.dueDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dryRun.acceptedRows > dryRun.acceptedPreview.length ? (
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  … and {dryRun.acceptedRows - dryRun.acceptedPreview.length} more accepted row
                  {dryRun.acceptedRows - dryRun.acceptedPreview.length === 1 ? '' : 's'}.
                </p>
              ) : null}
            </div>
          ) : null}

          {dryRun.rejections.length > 0 ? (
            <div className="mb-4 overflow-x-auto rounded-lg border border-rose-100">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-rose-100 bg-rose-50 text-xs uppercase tracking-wide text-rose-800">
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Original values</th>
                    <th className="px-3 py-2 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dryRun.rejections.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-2 font-medium text-slate-900">{r.rowNumber}</td>
                      <td className="px-3 py-2 text-slate-600">{r.values.join(', ')}</td>
                      <td className="px-3 py-2 text-rose-700">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mb-4 text-sm text-emerald-700">Every row passed validation.</p>
          )}

          <p className="mb-4 text-xs text-slate-500">
            Nothing has been written yet. Confirming creates {dryRun.acceptedRows} control
            {dryRun.acceptedRows === 1 ? '' : 's'} and records all {dryRun.totalRows} row outcomes
            (including rejections) in the append-only import log.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('map')}>
              Back to mapping
            </Button>
            <Button disabled={busy} onClick={() => void confirmImport()}>
              {busy ? 'Importing…' : `Confirm import (${dryRun.acceptedRows} accepted)`}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'done' && importRun ? (
        <Card title="Import complete">
          <p className="text-sm text-slate-700">
            Imported <strong>{importRun.accepted_rows}</strong> of{' '}
            <strong>{importRun.total_rows}</strong> rows;{' '}
            <strong>{importRun.rejected_rows}</strong> rejected with recorded reasons.
          </p>
          <p className="mt-2 break-all text-xs text-slate-500">
            File checksum (SHA-256): {importRun.filename_checksum}
          </p>
          <div className="mt-4">
            <Button onClick={reset}>Import another file</Button>
          </div>
        </Card>
      ) : null}

      <ImportHistory refreshKey={importRun?.id ?? 'none'} isAdmin={user?.role === 'admin'} />
    </div>
  );
}

function ImportHistory({ refreshKey, isAdmin }: { refreshKey: string; isAdmin: boolean }) {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, ImportRowResult[]>>({});

  useEffect(() => {
    void api<{ importRuns: ImportRun[] }>('/api/imports').then((res) => setRuns(res.importRuns));
  }, [refreshKey]);

  const toggle = async (runId: string) => {
    if (openRun === runId) {
      setOpenRun(null);
      return;
    }
    setOpenRun(runId);
    if (!rows[runId]) {
      const res = await api<{ rows: ImportRowResult[] }>(`/api/imports/${runId}/rows`);
      setRows((r) => ({ ...r, [runId]: res.rows }));
    }
  };

  return (
    <Card
      title="Import history"
      info={
        <p>
          One entry per confirmed import: when, how many rows were accepted and rejected, and
          the SHA-256 checksum of the uploaded file. Expand a run to see every row&rsquo;s outcome
          and rejection reason. This record is append-only — it cannot be edited or deleted,
          even by admins.
        </p>
      }
    >
      {runs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No imports yet"
          hint="Completed import runs appear here with their full row-level provenance."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {runs.map((run) => (
            <li key={run.id} className="py-3">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                onClick={() => void toggle(run.id)}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                  <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
                  {formatDate(run.created_at)}
                </span>
                <span className="text-xs text-slate-500">
                  {run.total_rows} rows · <span className="text-emerald-700">{run.accepted_rows} accepted</span> ·{' '}
                  <span className="text-rose-700">{run.rejected_rows} rejected</span>
                </span>
              </button>
              {openRun === run.id ? (
                <div className="mt-3 space-y-2">
                  <p className="break-all text-xs text-slate-400">
                    File SHA-256: {run.filename_checksum}
                  </p>
                  {rows[run.id] ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-2 font-semibold">Row</th>
                            <th className="px-3 py-2 font-semibold">Status</th>
                            <th className="px-3 py-2 font-semibold">Reason</th>
                            {isAdmin ? <th className="px-3 py-2 font-semibold">Row checksum</th> : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows[run.id]!.map((r) => (
                            <tr key={r.id}>
                              <td className="px-3 py-1.5 font-medium text-slate-900">
                                {r.row_number}
                              </td>
                              <td className="px-3 py-1.5">
                                {r.status === 'accepted' ? (
                                  <span className="text-emerald-700">Accepted</span>
                                ) : (
                                  <span className="text-rose-700">Rejected</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-slate-600">
                                {r.rejection_reason ?? '—'}
                              </td>
                              {isAdmin ? (
                                <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400">
                                  {r.row_checksum.slice(0, 16)}…
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Loading…</p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
