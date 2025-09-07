'use client';

import { useState, useEffect } from 'react';

type DebugData = {
  environment: string;
  timestamp: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  qboEnv: string;
  analysis?: any;
  oauthUrls?: any;
  testUrls?: any;
  instructions: string[];
};

export default function QBOComprehensiveDebugPage() {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTest, setActiveTest] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDebugData() {
      try {
        const response = await fetch('/api/qbo/debug-oauth-request');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: DebugData = await response.json();
        setDebugData(data);
      } catch (error) {
        console.error('Error fetching debug data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDebugData();
  }, []);

  const testRedirectVariations = async () => {
    setActiveTest('redirect-variations');
    try {
      const response = await fetch('/api/qbo/test-redirect-variations');
      const data = await response.json();
      setDebugData(data);
    } catch (error) {
      console.error('Error testing redirect variations:', error);
    } finally {
      setActiveTest(null);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading comprehensive debug information...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks Comprehensive Debug</h1>
      
      {debugData && (
        <div>
          <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔍 Current Configuration</h2>
            <p><strong>Environment:</strong> {debugData.environment}</p>
            <p><strong>Client ID:</strong> {debugData.clientId}</p>
            <p><strong>Redirect URI:</strong> <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '3px' }}>{debugData.redirectUri}</code></p>
            <p><strong>Scopes:</strong> {debugData.scopes}</p>
            <p><strong>QBO Environment:</strong> {debugData.qboEnv}</p>
          </div>

          {debugData.analysis && (
            <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
              <h2>🔬 Detailed Analysis</h2>
              <p><strong>Length:</strong> {debugData.analysis.length} characters</p>
              <p><strong>Valid URL:</strong> {debugData.analysis.isValidUrl ? '✅ Yes' : '❌ No'}</p>
              <p><strong>Has HTTPS:</strong> {debugData.analysis.hasHttps ? '✅ Yes' : '❌ No'}</p>
              <p><strong>Has Trailing Slash:</strong> {debugData.analysis.hasTrailingSlash ? '✅ Yes' : '❌ No'}</p>
              <p><strong>Domain:</strong> {debugData.analysis.domain}</p>
              <p><strong>Path:</strong> {debugData.analysis.path}</p>
              
              <h3>Character Analysis:</h3>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', backgroundColor: '#fff', padding: '10px', borderRadius: '3px', maxHeight: '200px', overflow: 'auto' }}>
                {debugData.analysis.characters.map((char: any, index: number) => (
                  <span key={index} style={{ 
                    backgroundColor: char.code === 32 ? '#ffeb3b' : 'transparent',
                    color: char.code === 32 ? '#000' : 'inherit'
                  }}>
                    {char.char === ' ' ? '␣' : char.char}
                  </span>
                ))}
              </div>
            </div>
          )}

          {debugData.oauthUrls && (
            <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
              <h2>🔗 OAuth URL Tests</h2>
              {Object.entries(debugData.oauthUrls).map(([key, url]) => (
                <div key={key} style={{ marginBottom: '10px' }}>
                  <h4>{key.replace(/_/g, ' ').toUpperCase()}</h4>
                  <button
                    onClick={() => window.open(url as string, '_blank')}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#357ab2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      marginRight: '10px'
                    }}
                  >
                    Test This URL
                  </button>
                  <code style={{ fontSize: '10px', wordBreak: 'break-all', backgroundColor: '#f5f5f5', padding: '4px', borderRadius: '3px' }}>
                    {url as string}
                  </code>
                </div>
              ))}
            </div>
          )}

          {debugData.testUrls && (
            <div style={{ backgroundColor: '#d4edda', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
              <h2>🔄 Redirect URI Variations Test</h2>
              <p>Testing different redirect URI formats to find the one that works:</p>
              {debugData.testUrls.map((test: any, index: number) => (
                <div key={index} style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '3px', 
                  padding: '10px', 
                  marginBottom: '10px',
                  backgroundColor: '#fff'
                }}>
                  <h4>Variation {test.variation}</h4>
                  <p><strong>Redirect URI:</strong> <code>{test.redirectUri}</code></p>
                  <p><strong>Encoded:</strong> <code style={{ fontSize: '10px' }}>{test.encoded}</code></p>
                  <button
                    onClick={() => window.open(test.oauthUrl, '_blank')}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    Test This Variation
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={testRedirectVariations}
              disabled={activeTest === 'redirect-variations'}
              style={{
                padding: '10px 20px',
                backgroundColor: activeTest === 'redirect-variations' ? '#6c757d' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: activeTest === 'redirect-variations' ? 'not-allowed' : 'pointer',
                marginRight: '10px'
              }}
            >
              {activeTest === 'redirect-variations' ? 'Testing...' : 'Test Redirect URI Variations'}
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

          <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px' }}>
            <h2>📋 Instructions</h2>
            <ol>
              {debugData.instructions.map((instruction, index) => (
                <li key={index} style={{ marginBottom: '8px' }}>
                  {instruction}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
