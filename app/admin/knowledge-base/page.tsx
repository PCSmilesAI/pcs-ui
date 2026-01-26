'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import '@fortawesome/fontawesome-free/css/all.min.css';

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

interface VendorHistoryStats {
  vendor_name: string;
  entry_count: number;
  corrected_count: number;
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
  const [masterParsingPrompt, setMasterParsingPrompt] = useState<SystemPrompt | null>(null);
  
  // History stats
  const [historyStats, setHistoryStats] = useState<{
    total_vendors: number;
    total_entries: number;
    vendors: VendorHistoryStats[];
  } | null>(null);

  // Edit state
  const [editedKBs, setEditedKBs] = useState<Record<string, string>>({});
  const [editedTrainingPrompt, setEditedTrainingPrompt] = useState<string>('');
  const [editedMasterParsingPrompt, setEditedMasterParsingPrompt] = useState<string>('');

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('');
  const [newVendorName, setNewVendorName] = useState('');

  // PCS AI connection status
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
      
      // Fetch knowledge bases and history stats in parallel
      const [kbResponse, historyResponse] = await Promise.all([
        fetch('/api/knowledge-base'),
        fetch('/api/vendor-history')
      ]);
      
      if (!kbResponse.ok) {
        throw new Error('Failed to fetch knowledge bases');
      }
      const data = await kbResponse.json();
      
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
      
      // Find the Master Parsing Prompt
      const mpp = (data.systemPrompts || []).find(
        (sp: SystemPrompt) => sp.prompt_name === 'Master Parsing Prompt'
      );
      setMasterParsingPrompt(mpp || null);
      if (mpp) {
        setEditedMasterParsingPrompt(mpp.prompt_text);
      }
      
      // Process history stats
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        setHistoryStats({
          total_vendors: historyData.stats?.total_vendors || 0,
          total_entries: historyData.stats?.total_entries || 0,
          vendors: historyData.vendors || []
        });
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

  async function saveMasterParsingPrompt() {
    if (!editedMasterParsingPrompt.trim()) {
      showToast('Master Parsing prompt cannot be empty', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'system',
          promptName: 'Master Parsing Prompt',
          promptText: editedMasterParsingPrompt
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      showToast('Master Parsing Prompt saved successfully!', 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
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
      <div style={{ padding: '24px' }}>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">Verifying access...</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '24px' }}>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-lg text-red-600 font-semibold">Access Denied</p>
          <p className="text-gray-600 mt-2">Only admins can access this page. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-gray-600 mt-2">
            Configure PCS AI parsing prompts for each vendor
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* PCS AI Status Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            gptStatus?.connected 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              gptStatus?.connected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            {gptStatus?.connected ? `PCS AI Connected (${gptStatus.model})` : 'PCS AI Disconnected'}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: 500,
              border: '1px solid #357ab2',
              backgroundColor: loading ? '#e5e7eb' : '#ffffff',
              color: loading ? '#9ca3af' : '#357ab2',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-gray-600">Loading knowledge bases...</div>
          </div>
        ) : (
          <>
            {/* Master Parsing Prompt Section */}
            <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: '#e8f4fc' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: '#357ab2' }}>Master Parsing Prompt</h2>
                    <p className="text-sm" style={{ color: '#5a9fd4' }}>
                      Global extraction rules applied to ALL invoice parsing (runs before vendor-specific prompts)
                    </p>
                  </div>
                  <button
                    onClick={saveMasterParsingPrompt}
                    disabled={saving || editedMasterParsingPrompt === masterParsingPrompt?.prompt_text}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      fontSize: '14px',
                      fontWeight: 500,
                      border: saving || editedMasterParsingPrompt === masterParsingPrompt?.prompt_text ? '1px solid #9ca3af' : '1px solid #357ab2',
                      backgroundColor: saving || editedMasterParsingPrompt === masterParsingPrompt?.prompt_text ? '#e5e7eb' : '#357ab2',
                      color: saving || editedMasterParsingPrompt === masterParsingPrompt?.prompt_text ? '#9ca3af' : '#ffffff',
                      cursor: saving || editedMasterParsingPrompt === masterParsingPrompt?.prompt_text ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Master Parsing Prompt'}
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div style={{ width: '70%' }}>
                  <textarea
                    value={editedMasterParsingPrompt}
                    onChange={(e) => setEditedMasterParsingPrompt(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '400px',
                      padding: '12px',
                      border: '2px solid #357ab2',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      resize: 'none',
                      overflow: 'auto',
                    }}
                    placeholder="Enter the master parsing prompt..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Use {"{{QBO_VENDORS}}"} and {"{{QBO_CLASSES}}"} as placeholders - these will be auto-populated with QBO data during parsing
                  </p>
                </div>
              </div>
            </div>

            {/* Training Prompt Section */}
            <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: '#e8f4fc' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: '#357ab2' }}>Training Prompt</h2>
                    <p className="text-sm" style={{ color: '#5a9fd4' }}>
                      Sent to PCS AI when admin corrections are made
                    </p>
                  </div>
                  <button
                    onClick={saveTrainingPrompt}
                    disabled={saving || editedTrainingPrompt === trainingPrompt?.prompt_text}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      fontSize: '14px',
                      fontWeight: 500,
                      border: saving || editedTrainingPrompt === trainingPrompt?.prompt_text ? '1px solid #9ca3af' : '1px solid #357ab2',
                      backgroundColor: saving || editedTrainingPrompt === trainingPrompt?.prompt_text ? '#e5e7eb' : '#357ab2',
                      color: saving || editedTrainingPrompt === trainingPrompt?.prompt_text ? '#9ca3af' : '#ffffff',
                      cursor: saving || editedTrainingPrompt === trainingPrompt?.prompt_text ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Training Prompt'}
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div style={{ width: '70%' }}>
                  <textarea
                    value={editedTrainingPrompt}
                    onChange={(e) => setEditedTrainingPrompt(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '240px',
                      padding: '12px',
                      border: '2px solid #357ab2',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      resize: 'none',
                      overflow: 'auto',
                    }}
                    placeholder="Enter the training prompt..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Use {"{{original_data}}"} and {"{{corrected_data}}"} as placeholders for the before/after data
                  </p>
                </div>
              </div>
            </div>

            {/* Training History Summary */}
            {historyStats && historyStats.total_entries > 0 && (
              <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: '#e8f4fc' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-semibold" style={{ color: '#357ab2' }}>Training History</h2>
                      <p className="text-sm" style={{ color: '#5a9fd4' }}>
                        Historical invoices used as examples for AI parsing
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-2xl font-bold" style={{ color: '#357ab2' }}>{historyStats.total_entries}</p>
                        <p className="text-xs" style={{ color: '#5a9fd4' }}>Total Examples</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold" style={{ color: '#357ab2' }}>{historyStats.total_vendors}</p>
                        <p className="text-xs" style={{ color: '#5a9fd4' }}>Vendors</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {historyStats.vendors
                      .sort((a, b) => b.entry_count - a.entry_count)
                      .slice(0, 8)
                      .map((vendor) => (
                        <div
                          key={vendor.vendor_name}
                          className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          <p className="font-medium text-gray-900 truncate" title={vendor.vendor_name}>
                            {vendor.vendor_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {vendor.entry_count} examples
                            {vendor.corrected_count > 0 && (
                              <span style={{ color: '#ea580c' }}> ({vendor.corrected_count} corrected)</span>
                            )}
                          </p>
                        </div>
                      ))}
                  </div>
                  {historyStats.vendors.length > 8 && (
                    <p className="text-sm text-gray-500 mt-3">
                      +{historyStats.vendors.length - 8} more vendors with training data
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Vendor Knowledge Bases Section */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: '#357ab2' }}>Vendor Knowledge Bases</h2>
                    <p className="text-sm text-gray-500">
                      {knowledgeBases.length} vendor{knowledgeBases.length !== 1 ? 's' : ''} configured
                    </p>
                  </div>
                  
                  {/* Search */}
                  <div className="flex items-center gap-4">
                    <input
                      type="text"
                      placeholder="Search vendors..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      style={{ minWidth: '200px' }}
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
                    className="px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent flex-grow"
                  />
                  <button
                    onClick={createNewVendorKB}
                    disabled={saving || !newVendorName.trim()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      fontSize: '14px',
                      fontWeight: 500,
                      border: saving || !newVendorName.trim() ? '1px solid #9ca3af' : '1px solid #16a34a',
                      backgroundColor: saving || !newVendorName.trim() ? '#e5e7eb' : '#16a34a',
                      color: saving || !newVendorName.trim() ? '#9ca3af' : '#ffffff',
                      cursor: saving || !newVendorName.trim() ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Add Vendor
                  </button>
                </div>
              </div>

              {/* Vendor List */}
              <div className="p-6 space-y-6">
                {filteredKBs.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    {searchQuery 
                      ? `No vendors matching "${searchQuery}"`
                      : 'No vendor knowledge bases configured yet. Add one above.'}
                  </div>
                ) : (
                  filteredKBs.map((kb) => {
                    const currentPrompt = editedKBs[kb.vendor_name] ?? kb.knowledge_prompt;
                    const hasChanges = hasKBChanges(kb.vendor_name, kb.knowledge_prompt);
                    
                    // Get history stats for this vendor
                    const vendorHistory = historyStats?.vendors.find(
                      v => v.vendor_name.toLowerCase() === kb.vendor_name.toLowerCase()
                    );
                    const historyCount = vendorHistory?.entry_count || 0;
                    const correctedCount = vendorHistory?.corrected_count || 0;

                    // Format date as MM/DD/YYYY
                    const formatDate = (dateStr: string | null) => {
                      if (!dateStr) return null;
                      const date = new Date(dateStr);
                      if (isNaN(date.getTime())) return null;
                      return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
                    };
                    
                    const latestUpdate = formatDate(kb.updated_at);

                    return (
                      <div key={kb.id} className="pb-6 border-b border-gray-200 last:border-0 last:pb-0">
                        {/* Vendor Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="text-lg font-semibold" style={{ color: '#357ab2' }}>{kb.vendor_name}</h3>
                            <p className="text-xs text-gray-500 mt-1">
                              {kb.training_invoice_count} Corrections Trained
                              {latestUpdate && ` (Latest Update: ${latestUpdate})`}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {/* History badge */}
                            {historyCount > 0 && (
                              <span 
                                className="px-2 py-1 text-xs rounded" 
                                style={{ backgroundColor: '#e8f4fc', color: '#357ab2' }}
                                title={`${historyCount} historical examples (${correctedCount} corrected)`}
                              >
                                {historyCount} examples
                              </span>
                            )}
                            {hasChanges && (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                                Unsaved
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Always Visible Editor */}
                        <div style={{ width: '70%' }}>
                          <textarea
                            value={currentPrompt}
                            onChange={(e) => handleKBEdit(kb.vendor_name, e.target.value)}
                            style={{
                              width: '100%',
                              minHeight: '240px',
                              padding: '12px',
                              border: '2px solid #357ab2',
                              borderRadius: '8px',
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              resize: 'none',
                              overflow: 'auto',
                            }}
                            placeholder="Enter the knowledge base prompt for this vendor..."
                          />
                          <div className="flex items-center gap-3 mt-3">
                            <button
                              onClick={() => saveVendorKB(kb.vendor_name)}
                              disabled={saving || !hasChanges}
                              style={{
                                padding: '8px 16px',
                                borderRadius: '9999px',
                                fontSize: '14px',
                                fontWeight: 500,
                                border: saving || !hasChanges ? '1px solid #9ca3af' : '1px solid #357ab2',
                                backgroundColor: saving || !hasChanges ? '#e5e7eb' : '#357ab2',
                                color: saving || !hasChanges ? '#9ca3af' : '#ffffff',
                                cursor: saving || !hasChanges ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            {hasChanges && (
                              <button
                                onClick={() => {
                                  setEditedKBs(prev => {
                                    const newState = { ...prev };
                                    delete newState[kb.vendor_name];
                                    return newState;
                                  });
                                }}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '9999px',
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  border: '1px solid #6b7280',
                                  backgroundColor: '#ffffff',
                                  color: '#6b7280',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                Reset
                              </button>
                            )}
                            <button
                              onClick={() => deleteVendorKB(kb.vendor_name)}
                              style={{
                                padding: '8px 16px',
                                borderRadius: '9999px',
                                fontSize: '14px',
                                fontWeight: 500,
                                border: '1px solid #dc2626',
                                backgroundColor: '#ffffff',
                                color: '#dc2626',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Info Box */}
            <div className="mt-6 bg-white rounded-lg shadow p-6 border-l-4" style={{ borderLeftColor: '#357ab2' }}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">How the AI Training System Works</h2>
              <ul className="text-sm text-gray-600 space-y-2">
                <li><strong className="text-gray-800">Knowledge Base Prompts:</strong> Each vendor has a master prompt that PCS AI uses when parsing their invoices</li>
                <li><strong className="text-gray-800">Historical Examples:</strong> When parsing, PCS AI receives up to 5 recent correctly-parsed invoices as reference examples</li>
                <li><strong className="text-gray-800">Automatic Learning:</strong> Admin corrections trigger PCS AI to analyze parsing failures and update the master prompt</li>
                <li><strong className="text-gray-800">Continuous Improvement:</strong> Corrected invoices are added to training history, improving future accuracy</li>
              </ul>
            </div>
          </>
        )}
    </div>
  );
}
