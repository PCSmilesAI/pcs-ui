'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface MechanicRun {
  id: number;
  timestamp: string;
  error_type: string;
  invoice_id: string | null;
  vendor: string | null;
  parser: string | null;
  status: 'success' | 'failed' | 'reverted';
  files_touched: string[];
  commit_hash: string | null;
  revert_commit: string | null;
  diff_preview: string | null;
}

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
  'laurag@pcsmiles.com',
]);

export default function AIMechanicPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<MechanicRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedRun, setSelectedRun] = useState<MechanicRun | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAuditTrail();
    }
  }, [isAdmin]);

  async function checkAdminAccess() {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('loggedInUser') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        const userEmail = parsed?.email?.toLowerCase() || '';
        setIsAdmin(ADMIN_EMAILS.has(userEmail));
        if (!ADMIN_EMAILS.has(userEmail)) {
          setError('Only admins can access this page');
          setTimeout(() => router.push('/'), 2000);
        }
      } else {
        setError('Please log in first');
        setTimeout(() => router.push('/'), 2000);
      }
    } catch (err) {
      console.error('Error checking admin access:', err);
      setError('Error verifying access');
      setTimeout(() => router.push('/'), 2000);
    }
  }

  async function fetchAuditTrail() {
    try {
      setLoading(true);
      const response = await fetch('/api/ai-mechanic/audit?limit=50');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch audit trail');
      }
      const data = await response.json();
      setRuns(Array.isArray(data) ? data : data.runs || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching audit trail:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevert(runId: number) {
    if (!confirm('Are you sure you want to revert this change? This will undo the parser modification.')) {
      return;
    }

    try {
      setReverting(runId);
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      
      const response = await fetch('/api/ai-mechanic/revert', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ runId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revert change');
      }

      showToast('Change reverted successfully', 'success');
      await fetchAuditTrail();
    } catch (err: any) {
      showToast(err.message, 'error');
      console.error('Error reverting:', err);
    } finally {
      setReverting(null);
    }
  }

  function showToast(message: string, variant: 'success' | 'error' = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 20px; right: 20px; padding: 12px 24px;
      background-color: ${variant === 'success' ? '#10b981' : '#ef4444'};
      color: white; border-radius: 6px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 3000);
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      reverted: 'bg-yellow-100 text-yellow-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }

  if (!isAdmin && loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <p className="text-red-600 font-semibold">Access Denied</p>
          <p className="text-gray-600 mt-2">Only admins can access this page. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">🤖 AI Mechanic Audit Trail</h1>
            <button onClick={fetchAuditTrail} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Refresh
            </button>
          </div>

          {error && (
            <div className="px-6 py-4 bg-red-50 border-b border-red-200">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="px-6 py-4">
            {loading ? (
              <p className="text-gray-600">Loading audit trail...</p>
            ) : runs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No AI mechanic runs yet.</p>
                <p className="text-gray-400 mt-2">When users correct invoice fields and trigger parser improvements, they&apos;ll appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Files</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {runs.map((run) => (
                      <tr key={run.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">#{run.id}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(run.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{run.error_type}</td>
                        <td className="px-4 py-3 text-sm">
                          {run.invoice_id ? (
                            <a href={`/InvoiceDetailPage?id=${run.invoice_id}`} className="text-blue-600 hover:underline">
                              {run.invoice_id}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{run.vendor || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {run.files_touched?.length > 0 ? (
                            <span title={run.files_touched.join(', ')}>
                              {run.files_touched.length} file(s)
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(run.status)}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSelectedRun(run)}
                              className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                            >
                              View Diff
                            </button>
                            {run.status === 'success' && (
                              <button
                                onClick={() => handleRevert(run.id)}
                                disabled={reverting === run.id}
                                className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50"
                              >
                                {reverting === run.id ? 'Reverting...' : 'Revert'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">How AI Mechanic Works</h2>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• When AP managers correct invoice fields, they can optionally trigger the AI Mechanic</li>
            <li>• The mechanic uses DeepSeek Coder to analyze corrections and improve parser code</li>
            <li>• Only whitelisted parser files can be modified (exodus_parser.py, henry_parser.py, etc.)</li>
            <li>• All changes are tracked with full diffs and can be reverted from this page</li>
            <li>• The mechanic runs on the Mac Mini via Tailscale (100.82.172.44:8001)</li>
          </ul>
        </div>
      </div>

      {/* Diff Modal */}
      {selectedRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden m-4">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                Run #{selectedRun.id} - {selectedRun.error_type}
              </h2>
              <button onClick={() => setSelectedRun(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
                <div><strong>Timestamp:</strong> {new Date(selectedRun.timestamp).toLocaleString()}</div>
                <div><strong>Status:</strong> <span className={`px-2 py-1 rounded ${getStatusBadge(selectedRun.status)}`}>{selectedRun.status}</span></div>
                <div><strong>Invoice:</strong> {selectedRun.invoice_id || '—'}</div>
                <div><strong>Vendor:</strong> {selectedRun.vendor || '—'}</div>
                <div><strong>Parser:</strong> {selectedRun.parser || '—'}</div>
                <div><strong>Commit:</strong> <code className="text-xs bg-gray-100 px-1 rounded">{selectedRun.commit_hash?.slice(0, 8) || '—'}</code></div>
              </div>
              <div className="mb-4">
                <strong className="text-sm">Files Touched:</strong>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedRun.files_touched?.map((f, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs">{f}</span>
                  )) || <span className="text-gray-500 text-sm">None</span>}
                </div>
              </div>
              {selectedRun.diff_preview && (
                <div>
                  <strong className="text-sm">Diff Preview:</strong>
                  <pre className="mt-2 p-4 bg-gray-900 text-green-400 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                    {selectedRun.diff_preview}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

