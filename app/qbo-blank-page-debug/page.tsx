'use client';

import { useState } from 'react';

export default function QBOBlankPageDebugPage() {
  const [testResults, setTestResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testDirectLink = () => {
    addResult('Testing direct OAuth link...');
    window.open('https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=ABzNrOV8FZ5uhyb0Gk46qPTcqxJq1JVWapDv9mgODpsUgfeHIf&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&access_type=offline', '_blank');
  };

  const testMinimalParams = () => {
    addResult('Testing with minimal parameters...');
    window.open('https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=ABzNrOV8FZ5uhyb0Gk46qPTcqxJq1JVWapDv9mgODpsUgfeHIf&response_type=code&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback', '_blank');
  };

  const testWithState = () => {
    addResult('Testing with state parameter...');
    window.open('https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=ABzNrOV8FZ5uhyb0Gk46qPTcqxJq1JVWapDv9mgODpsUgfeHIf&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&access_type=offline&state=test123', '_blank');
  };

  const testAlternativeEndpoint = () => {
    addResult('Testing alternative endpoint (appcenter)...');
    window.open('https://appcenter.intuit.com/connect/oauth2?client_id=ABzNrOV8FZ5uhyb0Gk46qPTcqxJq1JVWapDv9mgODpsUgfeHIf&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&access_type=offline', '_blank');
  };

  const testNetwork = async () => {
    addResult('Testing network connectivity...');
    try {
      const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=ABzNrOV8FZ5uhyb0Gk46qPTcqxJq1JVWapDv9mgODpsUgfeHIf&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&access_type=offline', { method: 'HEAD' });
      addResult(`Network test result: Status ${response.status}`);
    } catch (error) {
      addResult(`Network test failed: ${error}`);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks OAuth Blank Page Debug</h1>
      
      <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
        <h2>⚠️ Issue: Blank Page on OAuth Redirect</h2>
        <p>The Platform endpoint is working (no errors), but you're getting a blank page instead of the QuickBooks login page.</p>
        <p>Let's test different approaches to identify the cause.</p>
      </div>

      <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
        <h2>🧪 Debug Tests</h2>
        <p>Try each test below and report what you see:</p>
        
        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={testDirectLink}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            Test 1: Direct OAuth Link
          </button>
          <span style={{ color: '#666' }}>Opens OAuth URL in new tab</span>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={testMinimalParams}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            Test 2: Minimal Parameters
          </button>
          <span style={{ color: '#666' }}>Tests with only essential parameters</span>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={testWithState}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ffc107',
              color: 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            Test 3: With State Parameter
          </button>
          <span style={{ color: '#666' }}>Tests with state parameter added</span>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={testAlternativeEndpoint}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            Test 4: Alternative Endpoint
          </button>
          <span style={{ color: '#666' }}>Tests appcenter.intuit.com endpoint</span>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={testNetwork}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            Test 5: Network Test
          </button>
          <span style={{ color: '#666' }}>Tests if OAuth endpoint is reachable</span>
        </div>
      </div>

      <div style={{ backgroundColor: '#d1ecf1', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
        <h2>📋 Troubleshooting Steps</h2>
        <ol>
          <li><strong>Open Browser Console:</strong> Press F12 → Console tab</li>
          <li><strong>Try Each Test:</strong> Click each test button above</li>
          <li><strong>Check for Errors:</strong> Look for JavaScript errors in console</li>
          <li><strong>Try Different Browsers:</strong> Chrome, Firefox, Safari, Edge</li>
          <li><strong>Try Incognito Mode:</strong> Open in private/incognito window</li>
          <li><strong>Check Network Tab:</strong> F12 → Network tab to see if requests are being made</li>
        </ol>
      </div>

      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
        <h2>📊 Test Results</h2>
        <button
          onClick={clearResults}
          style={{
            padding: '5px 10px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            marginBottom: '10px'
          }}
        >
          Clear Results
        </button>
        <div style={{ backgroundColor: '#fff', padding: '10px', borderRadius: '3px', border: '1px solid #ddd', maxHeight: '200px', overflow: 'auto' }}>
          {testResults.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No test results yet. Click the test buttons above to start debugging.</p>
          ) : (
            testResults.map((result, index) => (
              <div key={index} style={{ marginBottom: '5px', fontSize: '14px' }}>
                {result}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '5px' }}>
        <h2>🔍 What to Look For</h2>
        <ul>
          <li><strong>QuickBooks Login Page:</strong> You should see Intuit/QuickBooks branding and login form</li>
          <li><strong>Blank Page:</strong> Completely white/empty page</li>
          <li><strong>Loading Spinner:</strong> Page that shows loading but never finishes</li>
          <li><strong>Error Message:</strong> Any error text displayed on the page</li>
          <li><strong>Redirect Loop:</strong> Page that keeps redirecting</li>
        </ul>
      </div>
    </div>
  );
}
