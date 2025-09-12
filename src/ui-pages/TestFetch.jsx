import React, { useState, useEffect } from 'react';

export default function TestFetch() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('🔄 TestFetch: Starting fetch...');
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/invoice-queue?limit=5', {
          cache: 'no-store',
        });
        
        console.log('📡 TestFetch: Response:', response.status, response.statusText);
        
        const text = await response.text();
        console.log('📝 TestFetch: Text length:', text.length);
        
        let parsedData;
        try {
          parsedData = JSON.parse(text);
        } catch (parseError) {
          console.error('❌ TestFetch: JSON parse error:', parseError);
          throw new Error(`JSON parse error: ${parseError.message}`);
        }
        
        console.log('✅ TestFetch: Data parsed:', {
          ok: parsedData.ok,
          count: parsedData.count,
          invoicesLength: parsedData.invoices?.length
        });
        
        setData(parsedData);
        
      } catch (err) {
        console.error('❌ TestFetch: Error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Test Fetch</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Test Fetch</h1>
        <p style={{ color: 'red' }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Test Fetch Results</h1>
      <p><strong>OK:</strong> {String(data.ok)}</p>
      <p><strong>Count:</strong> {data.count}</p>
      <p><strong>Invoices Length:</strong> {data.invoices?.length || 0}</p>
      <h2>Sample Invoices</h2>
      <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', fontSize: '12px' }}>
        {JSON.stringify(data.invoices?.slice(0, 2), null, 2)}
      </pre>
    </div>
  );
}
