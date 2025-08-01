import React from 'react';

/**
 * Company Info page shows organisation-wide information such as
 * office locations, billing details and contact emails. Static
 * content is provided here to mirror the wireframe; in a real
 * application this would be fetched from a server.
 */
export default function CompanyInfoPage() {
  const offices = [
    { name: 'Roseburg (Billing)', address: '1234 Main St, Roseburg, OR 97470' },
    { name: 'Lebanon', address: '200 Oak Ave, Lebanon, OR 97355' },
    { name: 'Eugene', address: '50 Pearl St, Eugene, OR 97401' },
    { name: 'Grants Pass', address: '789 Redwood Hwy, Grants Pass, OR 97526' },
    { name: 'Corvallis', address: '300 Kings Blvd, Corvallis, OR 97330' },
    { name: 'Salem', address: '400 State St, Salem, OR 97301' },
    { name: 'Portland', address: '600 River Pkwy, Portland, OR 97239' },
    { name: 'Medford', address: '123 Bear Creek Dr, Medford, OR 97501' },
  ];
  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' };
  const sectionTitleStyle = { fontSize: '18px', fontWeight: '600', color: '#357ab2', marginTop: '24px', marginBottom: '8px' };
  const listStyle = { listStyleType: 'none', padding: 0, margin: 0 };
  const listItemStyle = { marginBottom: '8px', fontSize: '16px', color: '#1f1f1f' };
  const infoStyle = { fontSize: '16px', marginBottom: '8px', color: '#1f1f1f' };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Company Info</h1>
      <h2 style={sectionTitleStyle}>Office Locations</h2>
      <ul style={listStyle}>
        {offices.map((office, idx) => (
          <li key={idx} style={listItemStyle}>
            <strong>{office.name}:</strong> {office.address}
          </li>
        ))}
      </ul>
      <h2 style={sectionTitleStyle}>Billing & Contacts</h2>
      <div style={infoStyle}><strong>Main Billing Location:</strong> Roseburg</div>
      <div style={infoStyle}><strong>Invoice Email:</strong> invoices@pcsmilesai.com</div>
      <div style={infoStyle}><strong>Company Tax ID:</strong> <em>(not provided)</em></div>
    </div>
  );
}