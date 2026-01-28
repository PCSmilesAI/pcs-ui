'use client';

export default function TestQboPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>QuickBooks Connection Test</h1>
      <div style={{ 
        padding: '16px', 
        backgroundColor: '#fef3c7', 
        border: '1px solid #f59e0b', 
        borderRadius: '16px',
        margin: '16px 0'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>QuickBooks Not Connected</p>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>Connect to QuickBooks to enable full functionality</p>
        <a 
          href="/api/qbo/auth"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            backgroundColor: '#2563eb',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Connect QuickBooks
        </a>
      </div>
      <p>If you can see this page and the blue button above, the basic setup is working.</p>
    </div>
  );
}
