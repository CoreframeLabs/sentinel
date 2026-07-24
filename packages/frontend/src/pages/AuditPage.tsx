import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ScrollText } from 'lucide-react';
import { api } from '../api';
import { AuditEntry } from '../types';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { auditLabel, timeAgo } from '../lib/format';

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
    <div className="fade-in space-y-6">
      <PageHeader
        title="Audit log"
        subtitle={`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · append-only, read-only for every role.`}
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-600/10">
            <Lock className="h-3.5 w-3.5" /> Immutable — enforced by the database
          </span>
        }
      />

      <Card>
        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No activity recorded yet"
            hint="Every state change on every control will be recorded here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Event</th>
                  <th className="py-2.5 pr-4 font-semibold">Control</th>
                  <th className="py-2.5 pr-4 font-semibold">User ID</th>
                  <th className="py-2.5 font-semibold">When (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      {auditLabel(entry.action)}
                    </td>
                    <td className="py-3 pr-4">
                      {entry.control_id ? (
                        <Link
                          to={`/controls/${entry.control_id}`}
                          className="font-mono text-xs text-slate-500 hover:text-indigo-600"
                          title={entry.control_id}
                        >
                          {entry.control_id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {entry.user_id ? (
                        <span className="font-mono text-xs text-slate-500" title={entry.user_id}>
                          {entry.user_id.slice(0, 8)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="text-slate-600" title={new Date(entry.created_at).toISOString()}>
                        {timeAgo(entry.created_at)}
                      </span>
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
