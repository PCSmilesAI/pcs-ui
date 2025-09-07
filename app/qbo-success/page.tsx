'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function QBOSuccessPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🎉 QuickBooks Connected Successfully!</h1>
      
      <div style={{ 
        backgroundColor: '#f0fdf4', 
        border: '1px solid #bbf7d0', 
        color: '#166534', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <h2>✅ Integration Complete</h2>
        <p>Your QuickBooks Online integration is now active and ready to use.</p>
        <p>You can now:</p>
        <ul>
          <li>Automatically create bills when invoices are approved</li>
          <li>Map dental categories to line items</li>
          <li>Attach PDFs to QuickBooks bills</li>
        </ul>
      </div>

      <div style={{ 
        backgroundColor: '#f8fafc', 
        border: '1px solid #e2e8f0', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Connection Details</h2>
        {loading ? (
          <p>Loading connection details...</p>
        ) : (
          <div>
            <p><strong>Status:</strong> {status?.connected ? '✅ Connected' : '❌ Not Connected'}</p>
            <p><strong>Message:</strong> {status?.message}</p>
            
            {status?.tokens && status.tokens.length > 0 && (
              <div>
                <h3>Connected Companies:</h3>
                {status.tokens.map((token: any, index: number) => (
                  <div key={index} style={{ 
                    backgroundColor: '#f1f5f9', 
                    padding: '10px', 
                    borderRadius: '4px', 
                    margin: '10px 0' 
                  }}>
                    <p><strong>Realm ID:</strong> {token.realmId}</p>
                    <p><strong>Access Token:</strong> {token.hasAccessToken ? '✅ Available' : '❌ Missing'}</p>
                    <p><strong>Refresh Token:</strong> {token.hasRefreshToken ? '✅ Available' : '❌ Missing'}</p>
                    <p><strong>Expires In:</strong> {token.expiresIn} seconds</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <Link 
          href="/" 
          style={{ 
            backgroundColor: '#3b82f6', 
            color: 'white', 
            padding: '12px 24px', 
            borderRadius: '6px', 
            textDecoration: 'none',
            display: 'inline-block'
          }}
        >
          Go to Dashboard
        </Link>
        
        <Link 
          href="/qbo-integration" 
          style={{ 
            backgroundColor: '#6b7280', 
            color: 'white', 
            padding: '12px 24px', 
            borderRadius: '6px', 
            textDecoration: 'none',
            display: 'inline-block'
          }}
        >
          Integration Settings
        </Link>
      </div>
    </div>
  );
}
