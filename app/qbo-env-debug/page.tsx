'use client';

import { useState, useEffect } from 'react';

type EnvDebugInfo = {
  environment: string;
  timestamp: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  qboEnv: string;
  encodedRedirectUri: string;
  generatedAuthUrl: string;
  instructions: string[];
};

export default function QBOEnvDebugPage() {
  const [debugInfo, setDebugInfo] = useState<EnvDebugInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDebugInfo() {
      try {
        const response = await fetch('/api/qbo/debug-env');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: EnvDebugInfo = await response.json();
        setDebugInfo(data);
      } catch (error) {
        console.error('Error fetching debug info:', error);
        setDebugInfo({
          environment: 'Error',
          timestamp: new Date().toISOString(),
          clientId: 'Error loading',
          redirectUri: 'Error loading',
          scopes: 'Error loading',
          qboEnv: 'Error loading',
          encodedRedirectUri: 'Error loading',
          generatedAuthUrl: 'Error loading',
          instructions: ['Failed to load debug information']
        });
      } finally {
        setLoading(false);
      }
    }

    fetchDebugInfo();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading environment debug information...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks Environment Debug</h1>
      
      {debugInfo && (
        <div>
          <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔍 Current Vercel Environment Variables</h2>
            <p><strong>Environment:</strong> {debugInfo.environment}</p>
            <p><strong>Timestamp:</strong> {debugInfo.timestamp}</p>
            <p><strong>Client ID:</strong> {debugInfo.clientId}</p>
            <p><strong>Redirect URI:</strong> <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '3px', border: '1px solid #ccc' }}>{debugInfo.redirectUri}</code></p>
            <p><strong>Encoded Redirect URI:</strong> <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '3px', border: '1px solid #ccc' }}>{debugInfo.encodedRedirectUri}</code></p>
            <p><strong>Scopes:</strong> {debugInfo.scopes}</p>
            <p><strong>QBO Environment:</strong> {debugInfo.qboEnv}</p>
          </div>

          <div style={{ backgroundColor: '#f0f8ff', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔗 Generated OAuth URL</h2>
            <p style={{ wordBreak: 'break-all', fontSize: '12px', backgroundColor: '#fff', padding: '8px', borderRadius: '3px', border: '1px solid #ccc' }}>
              {debugInfo.generatedAuthUrl}
            </p>
          </div>

          <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>⚠️ Critical: This Redirect URI Must Match Intuit Dashboard Exactly</h2>
            <p><strong>Copy this exact value:</strong></p>
            <div style={{ backgroundColor: '#fff', padding: '10px', borderRadius: '3px', border: '2px solid #ffc107', fontFamily: 'monospace', fontSize: '14px' }}>
              {debugInfo.redirectUri}
            </div>
          </div>

          <h2>📋 Fix Instructions:</h2>
          <ol style={{ lineHeight: '1.6' }}>
            {debugInfo.instructions.map((instruction, index) => (
              <li key={index} style={{ marginBottom: '8px' }}>
                {instruction}
              </li>
            ))}
          </ol>

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
