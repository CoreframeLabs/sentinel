import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Control } from '../types';
import { Card, ErrorNotice, StatusBadge } from '../components/ui';

export function ControlsPage() {
  const { user } = useAuth();
  const [controls, setControls] = useState<Control[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void api<{ controls: Control[] }>('/api/controls').then((res) => setControls(res.controls));
  }, [refresh]);

  const createControl = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api('/api/controls', { method: 'POST', body: { name, description } });
      setName('');
      setDescription('');
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <div className="space-y-6">
      {user?.role === 'admin' ? (
        <Card title="New control">
          <form onSubmit={(e) => void createControl(e)} className="space-y-3">
            <ErrorNotice message={error} />
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Control name (e.g. Access control audit)"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Create
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title={`Controls library (${controls.length})`}>
        {controls.length === 0 ? (
          <p className="text-sm text-slate-500">No controls yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Control</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {controls.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pr-4">
                    <Link to={`/controls/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.description ? (
                      <p className="text-xs text-slate-500">{c.description}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 text-slate-500">
                    {new Date(c.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
