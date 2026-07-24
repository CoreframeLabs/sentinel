import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Plus, Search } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/toast';
import { Control, ControlStatus } from '../types';
import {
  Button,
  Card,
  EmptyState,
  inputClass,
  Modal,
  PageHeader,
  STATUS_META,
  StatusBadge,
} from '../components/ui';
import { formatDate } from '../lib/format';

const FILTERS: (ControlStatus | 'all')[] = ['all', 'pending', 'in_review', 'passed', 'deferred'];

export function ControlsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [controls, setControls] = useState<Control[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ControlStatus | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void api<{ controls: Control[] }>('/api/controls').then((res) => setControls(res.controls));
  }, [refresh]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return controls.filter(
      (c) =>
        (filter === 'all' || c.status === filter) &&
        (q === '' || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    );
  }, [controls, query, filter]);

  const createControl = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/controls', { method: 'POST', body: { name, description } });
      toast.success('Control created.');
      setName('');
      setDescription('');
      setShowCreate(false);
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
        title="Controls library"
        subtitle={`${controls.length} control${controls.length === 1 ? '' : 's'} in your organisation.`}
        action={
          user?.role === 'admin' ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New control
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search controls…"
            className={`${inputClass} pl-9`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-100'
              }`}
            >
              {f === 'all' ? 'All' : STATUS_META[f].label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={controls.length === 0 ? 'No controls yet' : 'No controls match'}
            hint={
              controls.length === 0
                ? user?.role === 'admin'
                  ? 'Create your first compliance control to start tracking.'
                  : 'Your admin has not created any controls yet.'
                : 'Try a different search or status filter.'
            }
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2.5 pr-4 font-semibold">Control</th>
                <th className="py-2.5 pr-4 font-semibold">Status</th>
                <th className="hidden py-2.5 font-semibold sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((c) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  onClick={() => navigate(`/controls/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/controls/${c.id}`);
                  }}
                >
                  <td className="py-3.5 pr-4">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    {c.description ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{c.description}</p>
                    ) : null}
                  </td>
                  <td className="py-3.5 pr-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="hidden py-3.5 text-slate-500 sm:table-cell">
                    {formatDate(c.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal title="New control" open={showCreate} onClose={() => setShowCreate(false)}>
        <form onSubmit={(e) => void createControl(e)} className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Name</span>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Access control audit"
              className={`mt-1.5 ${inputClass}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Description (optional)</span>
            <textarea
              rows={3}
              placeholder="What does passing this control require?"
              className={`mt-1.5 ${inputClass}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create control'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
