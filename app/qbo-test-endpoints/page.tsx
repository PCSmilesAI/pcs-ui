'use client';

import { useState } from 'react';

export default function QBOTestEndpointsPage() {
  const [testing, setTesting] = useState<string | null>(null);

  const testEndpoints = [
    {
      name: 'Clean OAuth (Recommended)',
      url: '/api/qbo/clean-auth',
      description: 'Simple OAuth without extra parameters'
    },
    {
      name: 'Main Auth Route',
      url: '/api/qbo/auth',
      description: 'Full OAuth with PKCE and state parameters'
    },
    {
      name: 'Final Test Route',
      url: '/api/qbo/final-test',
      description: 'Previous working route'
    }
  ];

  const handleTest = (endpoint: string, name: string) => {
    setTesting(name);
    window.location.href = endpoint;
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#357ab2' }}>QuickBooks OAuth Endpoint Tester</h1>
      
      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
        <h2>🔍 Issue Identified:</h2>
        <p>The error URL shows you were redirected to an <strong>error page</strong> instead of the OAuth endpoint:</p>
        <code style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '3px', display: 'block', margin: '10px 0' }}>
          https://appcenter.intuit.com/app/connect/oauth2/error
        </code>
        <p><strong>Should be:</strong></p>
        <code style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '3px', display: 'block', margin: '10px 0' }}>
          https://appcenter.intuit.com/connect/oauth2
        </code>
      </div>

      <h2>🧪 Test Different Endpoints:</h2>
      
      {testEndpoints.map((endpoint, index) => (
        <div key={index} style={{ 
          border: '1px solid #ddd', 
          borderRadius: '5px', 
          padding: '15px', 
          marginBottom: '10px',
          backgroundColor: testing === endpoint.name ? '#e8f4fd' : '#fff'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#357ab2' }}>{endpoint.name}</h3>
          <p style={{ margin: '0 0 10px 0', color: '#666' }}>{endpoint.description}</p>
          <button
            onClick={() => handleTest(endpoint.url, endpoint.name)}
            disabled={testing === endpoint.name}
            style={{
              padding: '8px 16px',
              backgroundColor: testing === endpoint.name ? '#6c757d' : '#357ab2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: testing === endpoint.name ? 'not-allowed' : 'pointer'
            }}
          >
            {testing === endpoint.name ? 'Testing...' : 'Test This Endpoint'}
          </button>
        </div>
      ))}

      <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', padding: '15px', borderRadius: '5px', marginTop: '20px' }}>
        <h3>📋 Instructions:</h3>
        <ol>
          <li>Try each endpoint above</li>
          <li>Look for the correct OAuth page (not an error page)</li>
          <li>If you see the QuickBooks login page, that endpoint works!</li>
          <li>If you get redirected to an error page, try the next endpoint</li>
        </ol>
      </div>

      {testing && (
        <div style={{ 
          position: 'fixed', 
          top: '20px', 
          right: '20px', 
          backgroundColor: '#357ab2', 
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
