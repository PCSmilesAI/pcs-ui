'use client';

import { useEffect, useState } from 'react';

export default function QBOTestPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    const successParam = urlParams.get('qbo_connected');
    
    if (errorParam === 'missing_params') {
      setError('Please start the OAuth flow by clicking "Connect to QuickBooks" below.');
    }
    
    if (successParam === 'true') {
      setSuccess('🎉 Successfully connected to QuickBooks! Check the console for details.');
    }
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>QuickBooks Online Integration Test</h1>

      {error && (
        <div style={{ 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca', 
          color: '#dc2626', 
          padding: '16px', 
          borderRadius: '8px', 
          marginBottom: '20px' 
        }}>
          <h3>⚠️ Notice</h3>
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div style={{ 
          backgroundColor: '#f0fdf4', 
          border: '1px solid #bbf7d0', 
          color: '#166534', 
          padding: '16px', 
          borderRadius: '8px', 
          marginBottom: '20px' 
        }}>
          <h3>✅ Success</h3>
          <p>{success}</p>
        </div>
      )}

      <div style={{ 
        backgroundColor: '#f8fafc', 
        border: '1px solid #e2e8f0', 
        padding: '20px', 
        borderRadius: '8px' 
      }}>
        <h2>Connection Status: {success ? '✅ Connected' : '❌ Not Connected'}</h2>
        <p>This page is working! The Next.js routing is functioning correctly.</p>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            onClick={() => window.location.href = '/api/qbo/auth'}
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
              <a href="/api/test" target="_blank" style={{ color: '#3b82f6' }}>
                /api/test
              </a> - Test API routes
            </li>
          </ul>
        </div>

        <div style={{ marginTop: '20px' }}>
          <h3>Instructions:</h3>
          <ol>
            <li>Click "Connect to QuickBooks" above</li>
            <li>You'll be redirected to QuickBooks login</li>
            <li>Log in with your QuickBooks credentials</li>
            <li>Grant permissions to the app</li>
            <li>You'll be redirected back here with success message</li>
          </ol>
        </div>
      </div>
    </div>
  );
}