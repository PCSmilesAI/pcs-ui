'use client';

import { useState, useEffect } from 'react';

type OAuthTest = {
  name: string;
  url: string;
  description: string;
};

type OAuthTests = {
  [key: string]: OAuthTest;
};

type TestData = {
  environment: string;
  timestamp: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  qboEnv: string;
  oauthTests: OAuthTests;
  instructions: string[];
};

export default function QBOOAuthTestsPage() {
  const [testData, setTestData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTestData() {
      try {
        const response = await fetch('/api/qbo/test-standard-oauth');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: TestData = await response.json();
        setTestData(data);
      } catch (error) {
        console.error('Error fetching test data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchTestData();
  }, []);

  const testOAuth = (testName: string, url: string) => {
    setTesting(testName);
    window.open(url, '_blank');
    // Reset testing state after 3 seconds
    setTimeout(() => setTesting(null), 3000);
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading OAuth tests...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks OAuth Parameter Tests</h1>
      
      {testData && (
        <div>
          <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔍 Current Configuration</h2>
            <p><strong>Environment:</strong> {testData.environment}</p>
            <p><strong>Client ID:</strong> {testData.clientId}</p>
            <p><strong>Redirect URI:</strong> <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '3px' }}>{testData.redirectUri}</code></p>
            <p><strong>Scopes:</strong> {testData.scopes}</p>
            <p><strong>QBO Environment:</strong> {testData.qboEnv}</p>
          </div>

          <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>⚠️ Issue: Missing Query Parameters</h2>
            <p>You're getting "missing query parameters" errors, which means QuickBooks expects different or additional parameters than what we're sending.</p>
            <p>Let's test different OAuth 2.0 parameter combinations to find the one that works.</p>
          </div>

          <h2>🧪 OAuth Parameter Tests</h2>
          
          {Object.entries(testData.oauthTests).map(([key, test]) => (
            <div key={key} style={{ 
              border: '1px solid #ddd', 
              borderRadius: '5px', 
              padding: '15px', 
              marginBottom: '15px',
              backgroundColor: testing === test.name ? '#e8f4fd' : '#fff'
            }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#357ab2' }}>{test.name}</h3>
              <p style={{ margin: '0 0 10px 0', color: '#666' }}>{test.description}</p>
              
              <div style={{ marginBottom: '10px' }}>
                <button
                  onClick={() => testOAuth(test.name, test.url)}
                  disabled={testing === test.name}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: testing === test.name ? '#6c757d' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: testing === test.name ? 'not-allowed' : 'pointer',
                    marginRight: '10px'
                  }}
                >
                  {testing === test.name ? 'Testing...' : 'Test This Configuration'}
                </button>
                
                <button
                  onClick={() => navigator.clipboard.writeText(test.url)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Copy URL
                </button>
              </div>
              
              <details style={{ marginTop: '10px' }}>
                <summary style={{ cursor: 'pointer', color: '#357ab2' }}>View OAuth URL</summary>
                <code style={{ 
                  display: 'block', 
                  fontSize: '10px', 
                  wordBreak: 'break-all', 
                  backgroundColor: '#f5f5f5', 
                  padding: '8px', 
                  borderRadius: '3px',
                  marginTop: '5px'
                }}>
                  {test.url}
                </code>
              </details>
            </div>
          ))}

          <div style={{ backgroundColor: '#d4edda', padding: '15px', borderRadius: '5px', marginTop: '20px' }}>
            <h2>📋 Instructions</h2>
            <ol>
              {testData.instructions.map((instruction, index) => (
                <li key={index} style={{ marginBottom: '8px' }}>
                  {instruction}
                </li>
              ))}
            </ol>
          </div>

          <div style={{ marginTop: '20px' }}>
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
              Refresh Tests
            </button>
          </div>
        </div>
      )}

      {testing && (
        <div style={{ 
          position: 'fixed', 
          top: '20px', 
          right: '20px', 
          backgroundColor: '#28a745', 
          color: 'white', 
          padding: '10px 20px', 
          borderRadius: '5px',
          zIndex: 1000
        }}>
          Testing: {testing}...
        </div>
      )}
    </div>
  );
}
