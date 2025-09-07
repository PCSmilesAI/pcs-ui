'use client';

import { useState, useEffect } from 'react';

type RedirectUriTest = {
  name: string;
  redirectUri: string;
  encoded: string;
  description: string;
};

type OAuthTest = {
  name: string;
  description: string;
  redirectUri: string;
  encoded: string;
  platformUrl: string;
  appcenterUrl: string;
};

type OAuthTests = {
  [key: string]: OAuthTest;
};

type TestData = {
  environment: string;
  timestamp: string;
  clientId: string;
  scopes: string;
  state: string;
  redirectUriTests: {[key: string]: RedirectUriTest};
  oauthTests: OAuthTests;
  analysis: {
    issue: string;
    possibleCauses: string[];
    nextSteps: string[];
  };
  instructions: string[];
};

export default function QBORedirectDebugPage() {
  const [testData, setTestData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{[key: string]: string}>({});

  useEffect(() => {
    async function fetchTestData() {
      try {
        const response = await fetch('/api/qbo/debug-redirect-mismatch');
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

  const testOAuth = (testName: string, url: string, endpoint: string) => {
    setTesting(`${testName} (${endpoint})`);
    setTestResults(prev => ({
      ...prev,
      [`${testName}-${endpoint}`]: 'Testing... (check new tab)'
    }));
    
    // Open in new tab
    window.open(url, '_blank');
    
    // Reset testing state after 3 seconds
    setTimeout(() => {
      setTesting(null);
      setTestResults(prev => ({
        ...prev,
        [`${testName}-${endpoint}`]: 'Opened in new tab - check result'
      }));
    }, 3000);
  };

  const updateTestResult = (testName: string, endpoint: string, result: string) => {
    setTestResults(prev => ({
      ...prev,
      [`${testName}-${endpoint}`]: result
    }));
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading redirect URI debug tests...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks Redirect URI Debug</h1>
      
      {testData && (
        <div>
          <div style={{ backgroundColor: '#f8d7da', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>❌ Issue: Redirect URI Mismatch</h2>
            <p>The AppCenter endpoint gave us a redirect URI error, which means there's a mismatch between what we're sending and what's configured in your QuickBooks app.</p>
            <p><strong>Error:</strong> "The redirect_uri query parameter value is invalid. Make sure it is listed in the Redirect URIs section on your app's keys tab and matches it exactly."</p>
          </div>

          <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔍 Current Configuration</h2>
            <p><strong>Environment:</strong> {testData.environment}</p>
            <p><strong>Client ID:</strong> {testData.clientId}</p>
            <p><strong>Scopes:</strong> {testData.scopes}</p>
            <p><strong>State:</strong> <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '3px' }}>{testData.state}</code></p>
          </div>

          <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔍 Analysis</h2>
            <p><strong>Issue:</strong> {testData.analysis.issue}</p>
            
            <h3>Possible Causes:</h3>
            <ul>
              {testData.analysis.possibleCauses.map((cause, index) => (
                <li key={index}>{cause}</li>
              ))}
            </ul>
          </div>

          <h2>🧪 Redirect URI Variations</h2>
          <p>Test different redirect URI formats to find the one that matches your QuickBooks app configuration:</p>
          
          {Object.entries(testData.oauthTests).map(([key, test]) => (
            <div key={key} style={{ 
              border: '1px solid #ddd', 
              borderRadius: '5px', 
              padding: '15px', 
              marginBottom: '20px',
              backgroundColor: '#fff'
            }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#357ab2' }}>{test.name}</h3>
              <p style={{ margin: '0 0 10px 0', color: '#666' }}>{test.description}</p>
              
              <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '3px', marginBottom: '10px' }}>
                <p><strong>Redirect URI:</strong> <code style={{ backgroundColor: '#fff', padding: '2px 4px', borderRadius: '2px' }}>{test.redirectUri}</code></p>
                <p><strong>Encoded:</strong> <code style={{ backgroundColor: '#fff', padding: '2px 4px', borderRadius: '2px', fontSize: '12px' }}>{test.encoded}</code></p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Platform Endpoint Test */}
                <div style={{ border: '1px solid #007bff', borderRadius: '3px', padding: '10px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#007bff' }}>Platform Endpoint</h4>
                  <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>oauth.platform.intuit.com</p>
                  
                  <button
                    onClick={() => testOAuth(test.name, test.platformUrl, 'Platform')}
                    disabled={testing === `${test.name} (Platform)`}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: testing === `${test.name} (Platform)` ? '#6c757d' : '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: testing === `${test.name} (Platform)` ? 'not-allowed' : 'pointer',
                      marginRight: '5px',
                      fontSize: '12px'
                    }}
                  >
                    {testing === `${test.name} (Platform)` ? 'Testing...' : 'Test Platform'}
                  </button>

                  {testResults[`${test.name}-Platform`] && (
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
                      <strong>Result:</strong> {testResults[`${test.name}-Platform`]}
                    </div>
                  )}

                  <div style={{ marginTop: '5px' }}>
                    <button
                      onClick={() => updateTestResult(test.name, 'Platform', 'QuickBooks login page - SUCCESS!')}
                      style={{
                        padding: '2px 4px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        marginRight: '2px',
                        fontSize: '10px'
                      }}
                    >
                      ✅ Login
                    </button>
                    <button
                      onClick={() => updateTestResult(test.name, 'Platform', 'Blank page')}
                      style={{
                        padding: '2px 4px',
                        backgroundColor: '#ffc107',
                        color: 'black',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        marginRight: '2px',
                        fontSize: '10px'
                      }}
                    >
                      ⚪ Blank
                    </button>
                    <button
                      onClick={() => updateTestResult(test.name, 'Platform', 'Redirect URI error')}
                      style={{
                        padding: '2px 4px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      ❌ Error
                    </button>
                  </div>
                </div>

                {/* AppCenter Endpoint Test */}
                <div style={{ border: '1px solid #28a745', borderRadius: '3px', padding: '10px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#28a745' }}>AppCenter Endpoint</h4>
                  <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>appcenter.intuit.com</p>
                  
                  <button
                    onClick={() => testOAuth(test.name, test.appcenterUrl, 'AppCenter')}
                    disabled={testing === `${test.name} (AppCenter)`}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: testing === `${test.name} (AppCenter)` ? '#6c757d' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: testing === `${test.name} (AppCenter)` ? 'not-allowed' : 'pointer',
                      marginRight: '5px',
                      fontSize: '12px'
                    }}
                  >
                    {testing === `${test.name} (AppCenter)` ? 'Testing...' : 'Test AppCenter'}
                  </button>

                  {testResults[`${test.name}-AppCenter`] && (
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
                      <strong>Result:</strong> {testResults[`${test.name}-AppCenter`]}
                    </div>
                  )}

                  <div style={{ marginTop: '5px' }}>
                    <button
                      onClick={() => updateTestResult(test.name, 'AppCenter', 'QuickBooks login page - SUCCESS!')}
                      style={{
                        padding: '2px 4px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        marginRight: '2px',
                        fontSize: '10px'
                      }}
                    >
                      ✅ Login
                    </button>
                    <button
                      onClick={() => updateTestResult(test.name, 'AppCenter', 'Blank page')}
                      style={{
                        padding: '2px 4px',
                        backgroundColor: '#ffc107',
                        color: 'black',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        marginRight: '2px',
                        fontSize: '10px'
                      }}
                    >
                      ⚪ Blank
                    </button>
                    <button
                      onClick={() => updateTestResult(test.name, 'AppCenter', 'Redirect URI error')}
                      style={{
                        padding: '2px 4px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      ❌ Error
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div style={{ backgroundColor: '#d1ecf1', padding: '15px', borderRadius: '5px', marginTop: '20px' }}>
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
          backgroundColor: '#007bff', 
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
