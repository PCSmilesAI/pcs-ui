'use client';
import React, { useState, useEffect, useCallback } from 'react';

export default function ConnectionsPage() {
  const [qboConnected, setQboConnected] = useState(false);
  const [qboLoading, setQboLoading] = useState(true);
  const [qboError, setQboError] = useState(null);
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiLoading, setOpenaiLoading] = useState(true);
  const [openaiError, setOpenaiError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [orphanedInvoices, setOrphanedInvoices] = useState([]);
  const [showOrphanedModal, setShowOrphanedModal] = useState(false);
  const [retryInProgress, setRetryInProgress] = useState(false);
  const [retryResults, setRetryResults] = useState(null);

  const checkOrphanedBills = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices/orphaned-bills');
      const data = await res.json();
      if (data.ok && data.count > 0) {
        setOrphanedInvoices(data.invoices);
        setShowOrphanedModal(true);
      }
    } catch (err) {
      console.error('Failed to check orphaned bills:', err);
    }
  }, []);

  const handleRetryBills = async () => {
    setRetryInProgress(true);
    setRetryResults(null);
    try {
      const res = await fetch('/api/invoices/retry-bills', { method: 'POST' });
      const data = await res.json();
      setRetryResults(data);
      if (data.ok) {
        setOrphanedInvoices([]);
      }
    } catch (err) {
      setRetryResults({ ok: false, message: err.message || 'Request failed' });
    } finally {
      setRetryInProgress(false);
    }
  };

  // Check for success message from URL params, then check for orphaned bills
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('qbo_connected') === 'true') {
        setSuccessMessage('QuickBooks connected successfully!');
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        checkOrphanedBills();
      }
    }
  }, [checkOrphanedBills]);

  // Check QuickBooks connection status
  const checkQboStatus = useCallback(async () => {
    try {
      setQboLoading(true);
      setQboError(null);
      const response = await fetch('/api/qbo/status');
      const data = await response.json();
      setQboConnected(!!data.connected);
    } catch (statusError) {
      console.error('❌ Failed to check QuickBooks status:', statusError);
      setQboConnected(false);
      setQboError(statusError.message || 'Failed to check QuickBooks status');
    } finally {
      setQboLoading(false);
    }
  }, []);

  // Check OpenAI/PCS AI connection status
  const checkOpenAIStatus = useCallback(async () => {
    try {
      setOpenaiLoading(true);
      setOpenaiError(null);
      const response = await fetch('/api/gpt-parse');
      const data = await response.json();
      setOpenaiConnected(data.status === 'ok' && data.apiKeyConfigured);
      if (data.error) {
        setOpenaiError(data.error);
      }
    } catch (statusError) {
      console.error('Failed to check PCS AI status:', statusError);
      setOpenaiConnected(false);
      setOpenaiError(statusError.message || 'Failed to check PCS AI status');
    } finally {
      setOpenaiLoading(false);
    }
  }, []);

  useEffect(() => {
    checkQboStatus();
    checkOpenAIStatus();
  }, [checkQboStatus, checkOpenAIStatus]);

  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '24px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  };

  const sectionTitleStyle = {
    fontSize: '20px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '16px',
  };

  const statusCardStyle = (connected) => ({
    padding: '16px',
    borderRadius: '16px',
    border: `1px solid ${connected ? '#10b981' : '#ef4444'}`,
    backgroundColor: connected ? '#f0fdf4' : '#fef2f2',
    marginBottom: '16px',
  });

  const statusIndicatorStyle = (connected) => ({
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: connected ? '#10b981' : '#ef4444',
    marginRight: '12px',
    display: 'inline-block',
  });

  const statusTextStyle = (connected) => ({
    fontSize: '16px',
    fontWeight: 600,
    color: connected ? '#065f46' : '#991b1b',
    marginBottom: '4px',
  });

  const statusSubtextStyle = (connected) => ({
    fontSize: '14px',
    color: connected ? '#047857' : '#dc2626',
    marginBottom: '12px',
  });

  const buttonStyle = {
    padding: '8px 16px',
    borderRadius: '12px',
    border: '1px solid #357ab2',
    backgroundColor: '#357ab2',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  };

  const loadingStyle = {
    fontSize: '14px',
    color: '#6b7280',
    fontStyle: 'italic',
  };

  const errorStyle = {
    fontSize: '14px',
    color: '#dc2626',
    marginTop: '8px',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={cardStyle}>
        <h1 style={{ ...sectionTitleStyle, marginBottom: '24px' }}>Connections</h1>
        <p style={{ color: '#6b7280', marginBottom: '32px' }}>
          Manage your API connections for QuickBooks and PCS AI integrations.
        </p>

        {/* Success Message */}
        {successMessage && (
          <div style={{
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #10b981',
            backgroundColor: '#f0fdf4',
            marginBottom: '24px',
            color: '#065f46',
            fontWeight: 500,
          }}>
            ✅ {successMessage}
          </div>
        )}

        {/* QuickBooks Connection Status */}
        <div style={statusCardStyle(qboConnected)}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={statusIndicatorStyle(qboConnected)}></span>
            <h3 style={statusTextStyle(qboConnected)}>QuickBooks Online</h3>
          </div>
          {qboLoading ? (
            <p style={loadingStyle}>Checking QuickBooks connection...</p>
          ) : (
            <>
              <p style={statusSubtextStyle(qboConnected)}>
                {qboConnected
                  ? 'Connected successfully. Invoice billing and synchronization enabled.'
                  : 'Not connected. Connect to enable automated billing and invoice synchronization.'}
              </p>
              {!qboConnected && (
                <button
                  onClick={() => {
                    // Use direct navigation to avoid React router interference
                    window.location.href = `https://pcsmilesai.com/api/qbo/auth?t=${Date.now()}`;
                  }}
                  style={buttonStyle}
                >
                  Connect QuickBooks
                </button>
              )}
              {qboConnected && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={() => {
                      // Use direct navigation to avoid React router interference
                      window.location.href = `https://pcsmilesai.com/api/qbo/auth?t=${Date.now()}`;
                    }}
                    style={{ ...buttonStyle, backgroundColor: '#6b7280', borderColor: '#6b7280' }}
                  >
                    Reconnect QuickBooks
                  </button>
                </div>
              )}
            </>
          )}
          {qboError && <p style={errorStyle}>Error: {qboError}</p>}
        </div>

        {/* PCS AI (OpenAI) Connection Status */}
        <div style={statusCardStyle(openaiConnected)}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={statusIndicatorStyle(openaiConnected)}></span>
            <h3 style={statusTextStyle(openaiConnected)}>PCS AI (GPT 5 Nano)</h3>
          </div>
          {openaiLoading ? (
            <p style={loadingStyle}>Checking PCS AI connection...</p>
          ) : (
            <>
              <p style={statusSubtextStyle(openaiConnected)}>
                {openaiConnected
                  ? 'Connected successfully. Invoice parsing and knowledge base training enabled.'
                  : 'Not connected. API key needs to be configured in server environment.'}
              </p>
              <button
                onClick={checkOpenAIStatus}
                style={{
                  ...buttonStyle,
                  backgroundColor: openaiConnected ? '#6b7280' : '#357ab2',
                  borderColor: openaiConnected ? '#6b7280' : '#357ab2',
                }}
              >
                Test Connection
              </button>
            </>
          )}
          {openaiError && <p style={errorStyle}>Error: {openaiError}</p>}
        </div>

        {/* Refresh Button */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={() => {
              checkQboStatus();
              checkOpenAIStatus();
            }}
            style={{
              ...buttonStyle,
              backgroundColor: '#6b7280',
              borderColor: '#6b7280',
            }}
          >
            Refresh Status
          </button>
        </div>
      </div>

      {/* Orphaned Bills Modal */}
      {showOrphanedModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}>
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px',
            maxWidth: '540px', width: '90%', maxHeight: '80vh', overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            {!retryResults ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '28px' }}>&#x26A0;&#xFE0F;</span>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                    Missing QBO Bills Detected
                  </h2>
                </div>

                <p style={{ color: '#4b5563', marginBottom: '20px', lineHeight: 1.6 }}>
                  We found <strong>{orphanedInvoices.length}</strong> approved invoice{orphanedInvoices.length !== 1 ? 's' : ''} that
                  {orphanedInvoices.length !== 1 ? ' were' : ' was'} approved while QuickBooks was disconnected.
                  {orphanedInvoices.length !== 1 ? ' These invoices don\u2019t' : ' This invoice doesn\u2019t'} have
                  QBO bills yet. Would you like to create them now?
                </p>

                <div style={{
                  backgroundColor: '#f9fafb', borderRadius: '12px', padding: '12px 16px',
                  marginBottom: '24px', maxHeight: '200px', overflowY: 'auto',
                  border: '1px solid #e5e7eb',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Invoice #</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Vendor</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orphanedInvoices.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 8px', color: '#1f2937' }}>{inv.invoice_number}</td>
                          <td style={{ padding: '6px 8px', color: '#4b5563' }}>{inv.vendor_name}</td>
                          <td style={{ padding: '6px 8px', color: '#1f2937', textAlign: 'right' }}>
                            {inv.amount ? `$${Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowOrphanedModal(false)}
                    style={{
                      padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 500,
                      border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#374151', cursor: 'pointer',
                    }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={handleRetryBills}
                    disabled={retryInProgress}
                    style={{
                      padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 500,
                      border: '1px solid #357ab2', backgroundColor: '#357ab2', color: '#ffffff',
                      cursor: retryInProgress ? 'not-allowed' : 'pointer',
                      opacity: retryInProgress ? 0.7 : 1,
                    }}
                  >
                    {retryInProgress ? 'Creating Bills\u2026' : `Create ${orphanedInvoices.length} Bill${orphanedInvoices.length !== 1 ? 's' : ''} Now`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '28px' }}>{retryResults.ok && retryResults.failed === 0 ? '\u2705' : '\u26A0\uFE0F'}</span>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                    {retryResults.ok && retryResults.failed === 0 ? 'All Bills Created' : 'Bill Creation Complete'}
                  </h2>
                </div>

                {retryResults.ok ? (
                  <>
                    <p style={{ color: '#4b5563', marginBottom: '16px', lineHeight: 1.6 }}>
                      <strong>{retryResults.succeeded}</strong> bill{retryResults.succeeded !== 1 ? 's were' : ' was'} successfully
                      created in QuickBooks.
                      {retryResults.failed > 0 && (
                        <span style={{ color: '#dc2626' }}>
                          {' '}{retryResults.failed} bill{retryResults.failed !== 1 ? 's' : ''} failed.
                        </span>
                      )}
                    </p>

                    {retryResults.results && retryResults.results.length > 0 && (
                      <div style={{
                        backgroundColor: '#f9fafb', borderRadius: '12px', padding: '12px 16px',
                        marginBottom: '24px', maxHeight: '200px', overflowY: 'auto',
                        border: '1px solid #e5e7eb',
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Invoice #</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Status</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>QBO Bill ID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {retryResults.results.map((r) => (
                              <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '6px 8px', color: '#1f2937' }}>{r.invoice_number}</td>
                                <td style={{ padding: '6px 8px', color: r.ok ? '#059669' : '#dc2626' }}>
                                  {r.ok ? 'Created' : `Failed: ${r.error}`}
                                </td>
                                <td style={{ padding: '6px 8px', color: '#4b5563' }}>{r.billId || '\u2014'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ color: '#dc2626', marginBottom: '16px' }}>
                    {retryResults.message || 'An error occurred while creating bills.'}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setShowOrphanedModal(false); setRetryResults(null); }}
                    style={{
                      padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 500,
                      border: '1px solid #357ab2', backgroundColor: '#357ab2', color: '#ffffff', cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
