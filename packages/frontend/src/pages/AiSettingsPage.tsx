import { FormEvent, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { api, ApiError } from '../api';
import { useToast } from '../components/toast';
import { AiInteraction, AiSettings } from '../types';
import { Button, Card, EmptyState, inputClass, PageHeader } from '../components/ui';
import { formatDate } from '../lib/format';

const RESPONSE_TYPE_LABELS: Record<AiInteraction['response_type'], string> = {
  cited_assessment: 'Cited assessment',
  insufficient_evidence: 'Insufficient evidence',
  rate_limited: 'Rate limited',
  error: 'Error',
};

/** Admin-only: enable/disable the AI review feature for this organisation,
 * configure rate limits, and inspect the metadata-only interaction history. */
export function AiSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [deploymentEnabled, setDeploymentEnabled] = useState(true);
  const [interactions, setInteractions] = useState<AiInteraction[]>([]);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void api<{ settings: AiSettings; deploymentEnabled: boolean }>('/api/admin/ai-settings').then(
      (res) => {
        setSettings(res.settings);
        setDeploymentEnabled(res.deploymentEnabled);
      }
    );
    void api<{ interactions: AiInteraction[] }>('/api/admin/ai-interactions').then((res) =>
      setInteractions(res.interactions)
    );
  }, [refresh]);

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/admin/ai-settings', {
        method: 'PUT',
        body: {
          enabled: settings.enabled,
          maxRequestsPerUserPerDay: settings.maxRequestsPerUserPerDay,
          maxRequestsPerOrgPerDay: settings.maxRequestsPerOrgPerDay,
        },
      });
      toast.success('AI settings saved.');
      setRefresh((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in space-y-6">
      <PageHeader
        title="AI review settings"
        subtitle="Bounded AI review of submitted evidence. Disabled by default; the AI sees only the evidence note for the control under review."
      />

      {!deploymentEnabled ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          AI review is not configured for this deployment (AI_FEATURE_ENABLED is off). Settings can
          be saved but reviews will be unavailable until an operator enables it.
        </p>
      ) : null}

      <Card title="Feature and rate limits">
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            <span>
              <span className="font-medium text-slate-900">Enable AI review</span>
              <span className="block text-xs text-slate-500">
                Managers can request an AI assessment of submitted evidence for a control.
              </span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Max requests per user per day</span>
              <input
                type="number"
                min={1}
                required
                className={`mt-1.5 ${inputClass}`}
                value={settings.maxRequestsPerUserPerDay}
                onChange={(e) =>
                  setSettings({ ...settings, maxRequestsPerUserPerDay: Number(e.target.value) })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Max requests per organisation per day</span>
              <input
                type="number"
                min={1}
                required
                className={`mt-1.5 ${inputClass}`}
                value={settings.maxRequestsPerOrgPerDay}
                onChange={(e) =>
                  setSettings({ ...settings, maxRequestsPerOrgPerDay: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Interaction history (metadata only)">
        <p className="mb-3 text-xs text-slate-500">
          Every AI request is recorded append-only: who, when, which control, model, token counts
          and the validated outcome. Evidence text, prompts and model responses are never stored.
        </p>
        {interactions.length === 0 ? (
          <EmptyState icon={Bot} title="No AI interactions yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Requested</th>
                  <th className="py-2 pr-4 font-semibold">Outcome</th>
                  <th className="py-2 pr-4 font-semibold">Citations</th>
                  <th className="py-2 pr-4 font-semibold">Model</th>
                  <th className="py-2 font-semibold">Tokens (in/out)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {interactions.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-4 text-slate-600">{formatDate(i.requested_at)}</td>
                    <td className="py-2 pr-4 text-slate-900">
                      {RESPONSE_TYPE_LABELS[i.response_type]}
                      {i.error_code ? (
                        <span className="ml-1 text-xs text-slate-400">({i.error_code})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{i.citations_present ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-4 text-slate-600">{i.model}</td>
                    <td className="py-2 text-slate-600">
                      {i.prompt_token_count}/{i.completion_token_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
