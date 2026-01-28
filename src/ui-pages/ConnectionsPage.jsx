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

  // Check for success message from URL params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('qbo_connected') === 'true') {
        setSuccessMessage('QuickBooks connected successfully!');
        // Clear the URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, []);

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
                <a href="https://pcsmilesai.com/api/qbo/auth" style={buttonStyle}>
                  Connect QuickBooks
                </a>
              )}
              {qboConnected && (
                <div style={{ marginTop: '12px' }}>
                  <a href="https://pcsmilesai.com/api/qbo/auth" style={{ ...buttonStyle, backgroundColor: '#6b7280', borderColor: '#6b7280' }}>
                    Reconnect QuickBooks
                  </a>
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
    </div>
  );
}
