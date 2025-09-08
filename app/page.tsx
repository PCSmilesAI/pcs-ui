'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [qboConnected, setQboConnected] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check URL parameters for success message
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('qbo_connected') === 'true') {
      setQboConnected(true);
    }

    // Check QBO connection status
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/qbo/status');
      const data = await response.json();
      setStatus(data);
      setLoading(false);
    } catch (err: any) {
      console.error('Error checking status:', err);
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>PCS AI - QuickBooks Integration</h1>
      
      {qboConnected && (
        <div style={{ 
          backgroundColor: '#f0fdf4', 
          border: '1px solid #bbf7d0', 
          color: '#166534', 
          padding: '16px', 
          borderRadius: '8px', 
          marginBottom: '20px' 
        }}>
          <h2>🎉 QuickBooks Connected Successfully!</h2>
          <p>Your QuickBooks Online integration is now active and ready to use.</p>
        </div>
      )}

      <div style={{ 
        backgroundColor: '#f8fafc', 
        border: '1px solid #e2e8f0', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>QuickBooks Status</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div>
            <p><strong>Status:</strong> {status?.connected ? '✅ Connected' : '❌ Not Connected'}</p>
            <p><strong>Message:</strong> {status?.message}</p>
            
            {!status?.connected && (
              <div style={{ marginTop: '16px' }}>
                <a 
                  href="/api/qbo/auth" 
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  🔗 Connect to QuickBooks
                </a>
              </div>
            )}
            
            {status?.tokens && status.tokens.length > 0 && (
              <div>
                <h3>Connected Companies:</h3>
                <ul>
                  {status.tokens.map((token: any, index: number) => (
                    <li key={index}>
                      <strong>Realm ID:</strong> {token.realmId}<br/>
                      <strong>Access Token:</strong> {token.hasAccessToken ? '✅' : '❌'}<br/>
                      <strong>Refresh Token:</strong> {token.hasRefreshToken ? '✅' : '❌'}<br/>
                      <strong>Expires In:</strong> {token.expiresIn} seconds
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ 
        backgroundColor: '#eff6ff', 
        border: '1px solid #bfdbfe', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Available Pages</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ margin: '8px 0' }}>
            <Link href="/qbo-test" style={{ color: '#3b82f6', textDecoration: 'none' }}>
              🔗 QBO Test Page
            </Link> - Test QuickBooks OAuth flow
          </li>
          <li style={{ margin: '8px 0' }}>
            <Link href="/qbo-integration" style={{ color: '#3b82f6', textDecoration: 'none' }}>
              🔗 QBO Integration Dashboard
            </Link> - Comprehensive integration testing
          </li>
          <li style={{ margin: '8px 0' }}>
            <Link href="/test" style={{ color: '#3b82f6', textDecoration: 'none' }}>
              🔗 Test Page
            </Link> - Basic Next.js test page
          </li>
        </ul>
      </div>

      <div style={{ 
        backgroundColor: '#f0fdf4', 
        border: '1px solid #bbf7d0', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>✅ Features Implemented</h2>
        <ol>
          <li>✅ <strong>Automatic Bill Creation</strong> - Invoices automatically create QuickBooks bills when approved</li>
          <li>✅ <strong>Dental Category Mapping</strong> - Intelligent categorization of line items with UI controls</li>
          <li>✅ <strong>PDF Attachment</strong> - Original invoice PDFs automatically attached to QuickBooks bills</li>
        </ol>
        <p><strong>Note:</strong> All features are live and ready to use in the invoice detail pages!</p>
      </div>

      <div style={{ 
        backgroundColor: '#fef3c7', 
        border: '1px solid #fbbf24', 
        padding: '20px', 
        borderRadius: '8px'
      }}>
        <h2>⚠️ Current Limitation</h2>
        <p><strong>Memory Storage:</strong> QuickBooks tokens are currently stored in memory and reset between serverless function invocations. This means you'll need to reconnect to QuickBooks each time the function restarts.</p>
        <p><strong>Solution:</strong> For production, we should implement a persistent cloud database (PostgreSQL, MongoDB, etc.) to store tokens permanently.</p>
      </div>
    </div>
  );
}
