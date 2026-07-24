import { useEffect, useState } from 'react';
import { api } from '../api';
import { AuditEntry } from '../types';
import { Card } from '../components/ui';

/**
 * Read-only audit view. Deliberately shows IDs rather than names — the log
 * stores no content data, and the UI reflects that honestly.
 */
export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    void api<{ entries: AuditEntry[] }>('/api/audit').then((res) => setEntries(res.entries));
  }, []);

  return (
    <Card title={`Audit log (${entries.length} entries, append-only)`}>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No activity recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Timestamp (UTC)</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">User ID</th>
                <th className="py-2">Control ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-600">
                    {new Date(entry.created_at).toISOString()}
                  </td>
                  <td className="py-2 pr-4 font-medium">{entry.action}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                    {entry.user_id ?? '—'}
                  </td>
                  <td className="py-2 font-mono text-xs text-slate-500">
                    {entry.control_id ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
