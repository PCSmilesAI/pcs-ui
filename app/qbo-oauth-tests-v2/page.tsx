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
  state: string;
  oauthTests: OAuthTests;
  analysis: {
    currentIssue: string;
    possibleCauses: string[];
    nextSteps: string[];
  };
  instructions: string[];
};

export default function QBOOAuthTestsV2Page() {
  const [testData, setTestData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{[key: string]: string}>({});

  useEffect(() => {
    async function fetchTestData() {
      try {
        const response = await fetch('/api/qbo/test-oauth-response');
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
    setTestResults(prev => ({
      ...prev,
      [testName]: 'Testing... (check new tab)'
    }));
    
    // Open in new tab
    const newWindow = window.open(url, '_blank');
    
    // Reset testing state after 3 seconds
    setTimeout(() => {
      setTesting(null);
      setTestResults(prev => ({
        ...prev,
        [testName]: 'Opened in new tab - check if you see QuickBooks login page'
      }));
    }, 3000);
  };

  const updateTestResult = (testName: string, result: string) => {
    setTestResults(prev => ({
      ...prev,
      [testName]: result
    }));
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading OAuth tests...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks OAuth Tests V2</h1>
      
      {testData && (
        <div>
          <div style={{ backgroundColor: '#d4edda', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>✅ Progress: State Parameter Fixed!</h2>
            <p>We fixed the "missing state parameter" error. Now we need to find the right OAuth configuration that shows the QuickBooks login page instead of a blank page.</p>
          </div>

          <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔍 Current Configuration</h2>
            <p><strong>Environment:</strong> {testData.environment}</p>
            <p><strong>Client ID:</strong> {testData.clientId}</p>
            <p><strong>Redirect URI:</strong> <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '3px' }}>{testData.redirectUri}</code></p>
            <p><strong>Scopes:</strong> {testData.scopes}</p>
            <p><strong>State:</strong> <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '3px' }}>{testData.state}</code></p>
          </div>

          <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
            <h2>🔍 Analysis</h2>
            <p><strong>Current Issue:</strong> {testData.analysis.currentIssue}</p>
            
            <h3>Possible Causes:</h3>
            <ul>
              {testData.analysis.possibleCauses.map((cause, index) => (
                <li key={index}>{cause}</li>
              ))}
            </ul>
          </div>

          <h2>🧪 OAuth Configuration Tests</h2>
          <p>Try each test below and report what you see:</p>
          
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
                    cursor: 'pointer',
                    marginRight: '10px'
                  }}
                >
                  Copy URL
                </button>
              </div>

              {testResults[test.name] && (
                <div style={{ 
                  padding: '10px', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '3px', 
                  border: '1px solid #dee2e6',
                  marginBottom: '10px'
                }}>
                  <strong>Result:</strong> {testResults[test.name]}
                </div>
              )}

              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={() => updateTestResult(test.name, 'QuickBooks login page - SUCCESS!')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    marginRight: '5px',
                    fontSize: '12px'
                  }}
                >
                  ✅ Login Page
                </button>
                <button
                  onClick={() => updateTestResult(test.name, 'Blank page')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#ffc107',
                    color: 'black',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    marginRight: '5px',
                    fontSize: '12px'
                  }}
                >
                  ⚪ Blank Page
                </button>
                <button
                  onClick={() => updateTestResult(test.name, 'Error page')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    marginRight: '5px',
                    fontSize: '12px'
                  }}
                >
                  ❌ Error Page
                </button>
                <button
                  onClick={() => updateTestResult(test.name, 'Other issue')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ❓ Other
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

          <div style={{ backgroundColor: '#d1ecf1', padding: '15px', borderRadius: '5px', marginTop: '20px' }}>
            <h2>📋 Next Steps</h2>
            <ol>
              {testData.analysis.nextSteps.map((step, index) => (
                <li key={index} style={{ marginBottom: '8px' }}>
                  {step}
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
