import React, { useState, useEffect, useCallback } from 'react';

export default function ConnectionsPage() {
  const [qboConnected, setQboConnected] = useState(false);
  const [qboLoading, setQboLoading] = useState(true);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [qboError, setQboError] = useState(null);
  const [stripeError, setStripeError] = useState(null);

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

  // Check Stripe connection status
  const checkStripeStatus = useCallback(async () => {
    try {
      setStripeLoading(true);
      setStripeError(null);
      const response = await fetch('/api/stripe/status');
      const data = await response.json();
      setStripeConnected(!!data.connected);
    } catch (statusError) {
      console.error('❌ Failed to check Stripe status:', statusError);
      setStripeConnected(false);
      setStripeError(statusError.message || 'Failed to check Stripe status');
    } finally {
      setStripeLoading(false);
    }
  }, []);

  useEffect(() => {
    checkQboStatus();
    checkStripeStatus();
  }, [checkQboStatus, checkStripeStatus]);

  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
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
    borderRadius: '8px',
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
    borderRadius: '6px',
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
          Manage your API connections for QuickBooks and Stripe integrations.
        </p>

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
                <a href="/api/qbo/auth" style={buttonStyle}>
                  Connect QuickBooks
                </a>
              )}
              {qboConnected && (
                <div style={{ marginTop: '12px' }}>
                  <a href="/api/qbo/auth" style={{ ...buttonStyle, backgroundColor: '#6b7280', borderColor: '#6b7280' }}>
                    Reconnect QuickBooks
                  </a>
                </div>
              )}
            </>
          )}
          {qboError && <p style={errorStyle}>Error: {qboError}</p>}
        </div>

        {/* Stripe Connection Status */}
        <div style={statusCardStyle(stripeConnected)}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={statusIndicatorStyle(stripeConnected)}></span>
            <h3 style={statusTextStyle(stripeConnected)}>Stripe Payments</h3>
          </div>
          {stripeLoading ? (
            <p style={loadingStyle}>Checking Stripe connection...</p>
          ) : (
            <>
              <p style={statusSubtextStyle(stripeConnected)}>
                {stripeConnected
                  ? 'Connected successfully. Payment processing and webhook handling enabled.'
                  : 'Not connected. Connect to enable payment processing and automated invoice payments.'}
              </p>
              {!stripeConnected && (
                <a href="/api/stripe/connect" style={buttonStyle}>
                  Connect Stripe
                </a>
              )}
              {stripeConnected && (
                <div style={{ marginTop: '12px' }}>
                  <a href="/api/stripe/connect" style={{ ...buttonStyle, backgroundColor: '#6b7280', borderColor: '#6b7280' }}>
                    Reconnect Stripe
                  </a>
                </div>
              )}
            </>
          )}
          {stripeError && <p style={errorStyle}>Error: {stripeError}</p>}
        </div>

        {/* Refresh Button */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={() => {
              checkQboStatus();
              checkStripeStatus();
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
