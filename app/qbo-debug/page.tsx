'use client';

import { useState, useEffect } from 'react';

export default function QBODebugPage() {
  const [debugInfo, setDebugInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDebugInfo() {
      try {
        const response = await fetch('/api/qbo/debug-redirect');
        const data = await response.json();
        setDebugInfo(data);
      } catch (error) {
        console.error('Error fetching debug info:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDebugInfo();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading debug information...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks OAuth Debug</h1>
      
      {debugInfo && (
        <div>
          <h2>Current Configuration:</h2>
          <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <p><strong>Client ID:</strong> {debugInfo.clientId}</p>
            <p><strong>Redirect URI:</strong> <code style={{ backgroundColor: '#e0e0e0', padding: '2px 4px' }}>{debugInfo.redirectUri}</code></p>
            <p><strong>Encoded Redirect URI:</strong> <code style={{ backgroundColor: '#e0e0e0', padding: '2px 4px' }}>{debugInfo.encodedRedirectUri}</code></p>
          </div>

          <h2>Fix Instructions:</h2>
          <ol style={{ lineHeight: '1.6' }}>
            {debugInfo.instructions.map((instruction, index) => (
              <li key={index} style={{ marginBottom: '8px' }}>
                {instruction}
              </li>
            ))}
          </ol>

          <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', padding: '15px', borderRadius: '5px', marginTop: '20px' }}>
            <h3>Common Redirect URI Formats:</h3>
            <ul>
              <li><code>https://pcsmilesai.com/api/qbo/callback</code></li>
              <li><code>https://pcsmilesai.com/api/qbo/callback/</code></li>
              <li><code>https://www.pcsmilesai.com/api/qbo/callback</code></li>
            </ul>
            <p><strong>Note:</strong> The URI must match EXACTLY, including protocol (https://), domain, path, and trailing slash (if present).</p>
          </div>

          <div style={{ marginTop: '20px' }}>
            <button
              onClick={() => window.location.href = '/api/qbo/final-test'}
              style={{
                padding: '10px 20px',
                backgroundColor: '#357ab2',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Test OAuth Flow
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Refresh Debug Info
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
