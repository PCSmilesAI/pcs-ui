'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface VendorKnowledgeBase {
  id: string;
  vendor_name: string;
  knowledge_prompt: string;
  created_at: string;
  updated_at: string;
  version: number;
  last_trained_at: string | null;
  training_invoice_count: number;
}

interface SystemPrompt {
  id: string;
  prompt_name: string;
  prompt_text: string;
  description: string | null;
  updated_at: string;
}

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
]);

export default function KnowledgeBasePage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data state
  const [knowledgeBases, setKnowledgeBases] = useState<VendorKnowledgeBase[]>([]);
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [trainingPrompt, setTrainingPrompt] = useState<SystemPrompt | null>(null);

  // Edit state
  const [editedKBs, setEditedKBs] = useState<Record<string, string>>({});
  const [editedTrainingPrompt, setEditedTrainingPrompt] = useState<string>('');
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('');
  const [newVendorName, setNewVendorName] = useState('');

  // GPT connection status
  const [gptStatus, setGptStatus] = useState<{ connected: boolean; model: string } | null>(null);

  useEffect(() => {
    checkAdminAccess();
    fetchData();
    checkGptConnection();
  }, []);

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

  async function fetchData() {
    try {
      setLoading(true);
      const response = await fetch('/api/knowledge-base');
      if (!response.ok) {
        throw new Error('Failed to fetch knowledge bases');
      }
      const data = await response.json();
      
      setKnowledgeBases(data.knowledgeBases || []);
      setSystemPrompts(data.systemPrompts || []);

      // Find the Training Prompt
      const tp = (data.systemPrompts || []).find(
        (sp: SystemPrompt) => sp.prompt_name === 'Training Prompt'
      );
      setTrainingPrompt(tp || null);
      if (tp) {
        setEditedTrainingPrompt(tp.prompt_text);
      }

      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkGptConnection() {
    try {
      const response = await fetch('/api/gpt-parse');
      const data = await response.json();
      setGptStatus({
        connected: data.status === 'ok',
        model: data.model || 'unknown'
      });
    } catch {
      setGptStatus({ connected: false, model: 'unknown' });
    }
  }

  async function saveTrainingPrompt() {
    if (!editedTrainingPrompt.trim()) {
      showToast('Training prompt cannot be empty', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'system',
          promptName: 'Training Prompt',
          promptText: editedTrainingPrompt
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      showToast('Training Prompt saved successfully!', 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveVendorKB(vendorName: string) {
    const newPrompt = editedKBs[vendorName];
    if (!newPrompt || !newPrompt.trim()) {
      showToast('Knowledge base prompt cannot be empty', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/knowledge-base/${encodeURIComponent(vendorName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText: newPrompt })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      const data = await response.json();
      showToast(`${vendorName} knowledge base saved (v${data.knowledgeBase.version})`, 'success');
      
      // Clear edited state for this vendor
      setEditedKBs(prev => {
        const newState = { ...prev };
        delete newState[vendorName];
        return newState;
      });
      
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function createNewVendorKB() {
    if (!newVendorName.trim()) {
      showToast('Please enter a vendor name', 'error');
      return;
    }

    setSaving(true);
    try {
      // Create with default prompt by calling the API with create=true
      const response = await fetch(`/api/knowledge-base/${encodeURIComponent(newVendorName)}?create=true`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create');
      }

      showToast(`Knowledge base created for ${newVendorName}`, 'success');
      setNewVendorName('');
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteVendorKB(vendorName: string) {
    if (!confirm(`Are you sure you want to delete the knowledge base for "${vendorName}"?`)) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/knowledge-base/${encodeURIComponent(vendorName)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }

      showToast(`Knowledge base for ${vendorName} deleted`, 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function showToast(message: string, variant: 'success' | 'error' = 'success') {
    if (variant === 'success') {
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  }

  function toggleVendorExpanded(vendorName: string) {
    setExpandedVendors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vendorName)) {
        newSet.delete(vendorName);
      } else {
        newSet.add(vendorName);
      }
      return newSet;
    });
  }

  function handleKBEdit(vendorName: string, newText: string) {
    setEditedKBs(prev => ({
      ...prev,
      [vendorName]: newText
    }));
  }

  function hasKBChanges(vendorName: string, originalPrompt: string): boolean {
    return editedKBs[vendorName] !== undefined && editedKBs[vendorName] !== originalPrompt;
  }

  // Filter knowledge bases by search query
  const filteredKBs = searchQuery
    ? knowledgeBases.filter(kb => 
        kb.vendor_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : knowledgeBases;

  if (!isAdmin && loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-6xl mx-auto bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-6xl mx-auto bg-white rounded-lg shadow p-6">
          <p className="text-red-600 font-semibold">Access Denied</p>
          <p className="text-gray-600 mt-2">Only admins can access this page. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Configure GPT-4o parsing prompts for each vendor
                </p>
              </div>
              <div className="flex items-center gap-4">
                {/* GPT Status Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                  gptStatus?.connected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    gptStatus?.connected ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  {gptStatus?.connected ? `GPT Connected (${gptStatus.model})` : 'GPT Disconnected'}
                </div>
                <button
                  onClick={fetchData}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-200">
              <p className="text-red-800">{error}</p>
            </div>
          )}
          {successMessage && (
            <div className="px-6 py-3 bg-green-50 border-b border-green-200">
              <p className="text-green-800">{successMessage}</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">Loading knowledge bases...</p>
          </div>
        ) : (
          <>
            {/* Training Prompt Section */}
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="px-6 py-4 border-b border-gray-200 bg-purple-50">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-purple-900">Training Prompt</h2>
                    <p className="text-sm text-purple-700">
                      This prompt is sent to GPT when admin corrections are made to update vendor knowledge bases
                    </p>
                  </div>
                  <button
                    onClick={saveTrainingPrompt}
                    disabled={saving || editedTrainingPrompt === trainingPrompt?.prompt_text}
                    className={`px-4 py-2 rounded-md text-white ${
                      saving || editedTrainingPrompt === trainingPrompt?.prompt_text
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                  >
                    {saving ? 'Saving...' : 'Save Training Prompt'}
                  </button>
                </div>
              </div>
              <div className="p-6">
                <textarea
                  value={editedTrainingPrompt}
                  onChange={(e) => setEditedTrainingPrompt(e.target.value)}
                  className="w-full h-64 p-4 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter the training prompt..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  Use {"{{original_data}}"} and {"{{corrected_data}}"} as placeholders for the before/after data
                </p>
              </div>
            </div>

            {/* Vendor Knowledge Bases Section */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Vendor Knowledge Bases</h2>
                    <p className="text-sm text-gray-500">
                      {knowledgeBases.length} vendors configured
                    </p>
                  </div>
                  
                  {/* Search */}
                  <div className="flex items-center gap-4">
                    <input
                      type="text"
                      placeholder="Search vendors..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Add New Vendor */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    placeholder="New vendor name..."
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 flex-grow"
                  />
                  <button
                    onClick={createNewVendorKB}
                    disabled={saving || !newVendorName.trim()}
                    className={`px-4 py-2 rounded-md text-white ${
                      saving || !newVendorName.trim()
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    + Add Vendor
                  </button>
                </div>
              </div>

              {/* Vendor List */}
              <div className="divide-y divide-gray-200">
                {filteredKBs.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    {searchQuery 
                      ? `No vendors matching "${searchQuery}"`
                      : 'No vendor knowledge bases configured yet. Add one above.'}
                  </div>
                ) : (
                  filteredKBs.map((kb) => {
                    const isExpanded = expandedVendors.has(kb.vendor_name);
                    const currentPrompt = editedKBs[kb.vendor_name] ?? kb.knowledge_prompt;
                    const hasChanges = hasKBChanges(kb.vendor_name, kb.knowledge_prompt);

                    return (
                      <div key={kb.id} className="border-b border-gray-100 last:border-0">
                        {/* Vendor Header */}
                        <div
                          className="px-6 py-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center"
                          onClick={() => toggleVendorExpanded(kb.vendor_name)}
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-gray-400">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <div>
                              <h3 className="font-medium text-gray-900">{kb.vendor_name}</h3>
                              <p className="text-xs text-gray-500">
                                v{kb.version} • 
                                {kb.training_invoice_count > 0 
                                  ? ` ${kb.training_invoice_count} corrections trained`
                                  : ' No corrections trained'
                                }
                                {kb.last_trained_at && 
                                  ` • Last trained: ${new Date(kb.last_trained_at).toLocaleDateString()}`
                                }
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasChanges && (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                                Unsaved changes
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {kb.knowledge_prompt.length} chars
                            </span>
                          </div>
                        </div>

                        {/* Expanded Editor */}
                        {isExpanded && (
                          <div className="px-6 pb-6 bg-gray-50">
                            <textarea
                              value={currentPrompt}
                              onChange={(e) => handleKBEdit(kb.vendor_name, e.target.value)}
                              className="w-full h-64 p-4 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex justify-between items-center mt-4">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteVendorKB(kb.vendor_name);
                                }}
                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md"
                              >
                                Delete
                              </button>
                              <div className="flex gap-2">
                                {hasChanges && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditedKBs(prev => {
                                        const newState = { ...prev };
                                        delete newState[kb.vendor_name];
                                        return newState;
                                      });
                                    }}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                                  >
                                    Reset
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveVendorKB(kb.vendor_name);
                                  }}
                                  disabled={saving || !hasChanges}
                                  className={`px-4 py-2 rounded-md text-white ${
                                    saving || !hasChanges
                                      ? 'bg-gray-400 cursor-not-allowed'
                                      : 'bg-blue-600 hover:bg-blue-700'
                                  }`}
                                >
                                  {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Info Box */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-blue-900 mb-2">How Knowledge Bases Work</h2>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>• Each vendor has a unique knowledge base prompt that GPT-4o uses when parsing their invoices</li>
                <li>• When an admin corrects invoice fields and clicks Update, the Training Prompt is used to automatically update that vendor&apos;s knowledge base</li>
                <li>• Knowledge bases can be manually edited here to fine-tune parsing rules</li>
                <li>• Version numbers track how many times a knowledge base has been updated</li>
                <li>• New vendors get a default knowledge base prompt when first encountered</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
