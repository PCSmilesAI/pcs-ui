'use client';

import { useEffect, useState } from 'react';

export default function QBOIntegrationPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/qbo/status');
      const data = await response.json();
      setStatus(data);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const connectToQuickBooks = () => {
    window.location.href = '/api/qbo/final-test';
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>QuickBooks Integration</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>QuickBooks Online Integration</h1>
      
      {error && (
        <div style={{ 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca', 
          color: '#dc2626', 
          padding: '16px', 
          borderRadius: '8px', 
          marginBottom: '20px' 
        }}>
          <h3>❌ Error</h3>
          <p>{error}</p>
        </div>
      )}

      <div style={{ 
        backgroundColor: '#f8fafc', 
        border: '1px solid #e2e8f0', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Connection Status</h2>
        <p><strong>Status:</strong> {status?.connected ? '✅ Connected' : '❌ Not Connected'}</p>
        <p><strong>Message:</strong> {status?.message}</p>
        
        {status?.tokens && status.tokens.length > 0 && (
          <div>
            <h3>Stored Tokens:</h3>
            <ul>
              {status.tokens.map((token: any, index: number) => (
                <li key={index}>
                  <strong>Realm ID:</strong> {token.realmId}<br/>
                  <strong>Has Access Token:</strong> {token.hasAccessToken ? '✅' : '❌'}<br/>
                  <strong>Has Refresh Token:</strong> {token.hasRefreshToken ? '✅' : '❌'}<br/>
                  <strong>Expires In:</strong> {token.expiresIn} seconds
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ 
        backgroundColor: '#f0fdf4', 
        border: '1px solid #bbf7d0', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>QuickBooks App Configuration</h2>
        <p>✅ App Status: IN PRODUCTION</p>
        <p>✅ Client ID: ABfG1MwE5yhkAAqCw0RA2viwkI9cMdn33oagtgGOaJWdrkRBVl</p>
        <p>✅ Scopes: com.intuit.quickbooks.accounting</p>
        <p>✅ Redirect URI: https://pcsmilesai.com/api/qbo/callback</p>
        <p>✅ App Type: Web App</p>
      </div>

      <div style={{ 
        backgroundColor: '#eff6ff', 
        border: '1px solid #bfdbfe', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Next Steps</h2>
        <ol>
          <li>Click "Connect to QuickBooks" below</li>
          <li>You'll be redirected to QuickBooks login</li>
          <li>Log in with your QuickBooks credentials</li>
          <li>Grant permissions to the app</li>
          <li>You'll be redirected back with success message</li>
        </ol>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={connectToQuickBooks}
          style={{ 
            backgroundColor: '#3b82f6', 
            color: 'white', 
            padding: '12px 24px', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Connect to QuickBooks
        </button>
        
        <button
          onClick={checkStatus}
          style={{ 
            backgroundColor: '#6b7280', 
            color: 'white', 
            padding: '12px 24px', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Refresh Status
        </button>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>Test Endpoints:</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ margin: '8px 0' }}>
            <a href="/api/qbo/status" target="_blank" style={{ color: '#3b82f6' }}>
              /api/qbo/status
            </a> - Check connection status
          </li>
          <li style={{ margin: '8px 0' }}>
            <a href="/api/qbo/final-test" target="_blank" style={{ color: '#3b82f6' }}>
              /api/qbo/final-test
            </a> - Test OAuth flow
          </li>
          <li style={{ margin: '8px 0' }}>
            <a href="/api/test" target="_blank" style={{ color: '#3b82f6' }}>
              /api/test
            </a> - Test API routes
          </li>
        </ul>
      </div>
    </div>
  );
}
