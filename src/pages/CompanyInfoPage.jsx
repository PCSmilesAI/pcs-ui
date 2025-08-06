import React, { useState, useEffect } from 'react';

/**
 * Company Info page shows organisation-wide information such as
 * office locations, billing details and contact emails. Now loads
 * real data from the office_info.json file.
 */
export default function CompanyInfoPage() {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load office data from JSON file
  useEffect(() => {
    const loadOffices = async () => {
      try {
        console.log('🔄 CompanyInfoPage: Starting to load office data...');
        setLoading(true);
        const response = await fetch('/office_info.json');
        console.log('📡 CompanyInfoPage: Fetch response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to load office data: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 CompanyInfoPage: Office data received:', data.length, 'offices');
        
        setOffices(data);
        setError(null);
      } catch (err) {
        console.error('❌ CompanyInfoPage: Error loading office data:', err);
        setError(err.message);
        // Fallback to empty array if loading fails
        setOffices([]);
      } finally {
        console.log('🏁 CompanyInfoPage: Loading complete');
        setLoading(false);
      }
    };

    loadOffices();
  }, []);

  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' };
  const sectionTitleStyle = { fontSize: '18px', fontWeight: '600', color: '#357ab2', marginTop: '24px', marginBottom: '8px' };
  const listStyle = { listStyleType: 'none', padding: 0, margin: 0 };
  const listItemStyle = { 
    marginBottom: '16px', 
    fontSize: '16px', 
    color: '#1f1f1f',
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#f8fafc'
  };
  const officeNameStyle = { 
    fontWeight: '600', 
    color: '#357ab2', 
    fontSize: '18px',
    marginBottom: '4px'
  };
  const addressStyle = { 
    color: '#4a5568', 
    marginBottom: '4px',
    lineHeight: '1.4'
  };
  const managerStyle = { 
    color: '#2d3748', 
    marginBottom: '4px',
    fontWeight: '500'
  };
  const emailStyle = { 
    color: '#357ab2',
    textDecoration: 'none',
    fontWeight: '500'
  };
  const emailHoverStyle = { 
    textDecoration: 'underline',
    cursor: 'pointer'
  };
  const infoStyle = { fontSize: '16px', marginBottom: '8px', color: '#1f1f1f' };

  console.log('🎨 CompanyInfoPage: Rendering with', offices.length, 'offices, loading:', loading, 'error:', error);

  if (loading) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Company Info</h1>
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Loading office information...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Company Info</h1>
        <div style={{ textAlign: 'center', padding: '40px', color: '#e53e3e' }}>
          Error loading office information: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Company Info</h1>
      
      <h2 style={sectionTitleStyle}>Office Locations</h2>
      <ul style={listStyle}>
        {offices.map((office, idx) => (
          <li key={idx} style={listItemStyle}>
            <div style={officeNameStyle}>{office.name}</div>
            <div style={addressStyle}>{office.address}</div>
            <div style={managerStyle}>
              <strong>Office Manager:</strong> {office.manager}
            </div>
            {office.email && (
              <div>
                <a 
                  href={`mailto:${office.email}`}
                  style={emailStyle}
                  onMouseEnter={(e) => Object.assign(e.target.style, emailHoverStyle)}
                  onMouseLeave={(e) => {
                    e.target.style.textDecoration = 'none';
                    e.target.style.cursor = 'pointer';
                  }}
                >
                  📧 {office.email}
                </a>
              </div>
            )}
          </li>
        ))}
      </ul>
      
      <h2 style={sectionTitleStyle}>Billing & Contacts</h2>
      <div style={infoStyle}><strong>Main Billing Location:</strong> Roseburg</div>
      <div style={infoStyle}><strong>Invoice Email:</strong> invoices@pcsmilesai.com</div>
      <div style={infoStyle}><strong>Company Tax ID:</strong> <em>(not provided)</em></div>
      
      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
        <div style={{ fontWeight: '600', color: '#0369a1', marginBottom: '8px' }}>
          📞 Contact Information
        </div>
        <div style={{ fontSize: '14px', color: '#0c4a6e' }}>
          Click on any office manager's email address above to send them an email directly.
        </div>
      </div>
    </div>
  );
}