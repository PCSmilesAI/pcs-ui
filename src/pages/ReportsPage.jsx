import React, { useState, useMemo } from 'react';

/**
 * Reports page summarises invoice data into charts and tables. The
 * dataset below mirrors the example invoices used throughout the
 * application. Users can switch between all‑time, year‑to‑date and
 * month‑to‑date views. Charts are rendered using simple divs with
 * relative widths to approximate a pie chart and bar chart.
 */
export default function ReportsPage() {
  // Combine invoice data from all sections. Dates are provided in
  // YYYY‑MM‑DD format for easy comparison. Amounts are numeric.
  const allInvoices = [
    { vendor: 'Artisan Dental', amount: 1265.4, date: '2025-07-26' },
    { vendor: 'Exodus Dental Solutions', amount: 349.08, date: '2025-07-29' },
    { vendor: 'Henry Schein', amount: 622.47, date: '2025-07-30' },
    { vendor: 'Artisan Dental', amount: 1265.4, date: '2025-07-26' },
    { vendor: 'Exodus Dental Solutions', amount: 1349.08, date: '2025-07-29' },
    { vendor: 'Henry Schein', amount: 1622.47, date: '2025-07-30' },
    { vendor: 'Artisan Dental', amount: 1265.4, date: '2025-07-30' },
    { vendor: 'Exodus Dental Solutions', amount: 1349.08, date: '2025-07-30' },
    { vendor: 'Henry Schein', amount: 1622.47, date: '2025-08-13' },
  ];

  // Determine the current month and year for filtering. In a real
  // application you would use new Date() but here we assume July 2025.
  const currentDate = new Date('2025-07-31');
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Selection state: 'all', 'year', or 'month'
  const [range, setRange] = useState('all');

  /**
   * Filter invoices according to the selected range. All‑time
   * returns everything, year‑to‑date keeps records from the
   * current year, month‑to‑date keeps those from the current month.
   */
  const filteredInvoices = useMemo(() => {
    return allInvoices.filter(({ date }) => {
      const dt = new Date(date);
      if (range === 'year') {
        return dt.getFullYear() === currentYear;
      }
      if (range === 'month') {
        return dt.getFullYear() === currentYear && dt.getMonth() === currentMonth;
      }
      return true; // all time
    });
  }, [range]);

  /**
   * Aggregate the filtered invoices by vendor. Returns an array of
   * objects with vendor name, invoice count and total amount paid.
   */
  const vendorTotals = useMemo(() => {
    const map = {};
    filteredInvoices.forEach(({ vendor, amount }) => {
      if (!map[vendor]) {
        map[vendor] = { vendor, invoices: 0, total: 0 };
      }
      map[vendor].invoices += 1;
      map[vendor].total += amount;
    });
    return Object.values(map);
  }, [filteredInvoices]);

  // Compute overall total amount across all vendors for display and
  // percentage calculations. Guard against zero to avoid division
  // by zero.
  const grandTotal = vendorTotals.reduce((sum, v) => sum + v.total, 0);

  // Define colours for up to three vendors. Additional vendors will
  // recycle these colours.
  const colours = ['#357ab2', '#74b4e4', '#a7c9e6', '#6fa8dc'];

  // Styles
  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' };
  const sectionTitleStyle = { fontSize: '18px', fontWeight: '600', color: '#357ab2', margin: '16px 0 8px' };
  const buttonRowStyle = { display: 'flex', gap: '8px', marginBottom: '16px' };
  const rangeButtonStyle = (isActive) => ({
    padding: '8px 16px',
    border: '1px solid #357ab2',
    borderRadius: '4px',
    backgroundColor: isActive ? '#357ab2' : '#ffffff',
    color: isActive ? '#ffffff' : '#357ab2',
    cursor: 'pointer',
    fontWeight: '500',
  });
  const barContainerStyle = {
    width: '100%',
    height: '24px',
    display: 'flex',
    border: '1px solid #357ab2',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px',
  };
  const legendStyle = { display: 'flex', gap: '16px', marginBottom: '16px' };
  const legendItemStyle = { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px' };
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    fontSize: '14px',
  };
  const thStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    backgroundColor: '#f7fafc',
    color: '#357ab2',
    fontWeight: '600',
    textAlign: 'left',
  };
  const tdStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    color: '#1f1f1f',
    textAlign: 'left',
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Reports</h1>
      {/* Range selector */}
      <div style={buttonRowStyle}>
        {['all', 'year', 'month'].map((key) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            style={rangeButtonStyle(range === key)}
          >
            {key === 'all' ? 'All Time' : key === 'year' ? 'Year to Date' : 'Month to Date'}
          </button>
        ))}
      </div>
      {/* Vendor distribution pseudo pie chart */}
      <h2 style={sectionTitleStyle}>Vendor Distribution</h2>
      <div style={barContainerStyle}>
        {vendorTotals.map((v, idx) => {
          const widthPercent = grandTotal ? (v.total / grandTotal) * 100 : 0;
          return (
            <div
              key={v.vendor}
              style={{
                width: `${widthPercent}%`,
                backgroundColor: colours[idx % colours.length],
              }}
            ></div>
          );
        })}
      </div>
      <div style={legendStyle}>
        {vendorTotals.map((v, idx) => (
          <div key={v.vendor} style={legendItemStyle}>
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                backgroundColor: colours[idx % colours.length],
                borderRadius: '2px',
              }}
            ></span>
            <span>{v.vendor}</span>
          </div>
        ))}
      </div>
      {/* Total amount paid */}
      <h2 style={sectionTitleStyle}>Total Amount Paid</h2>
      <div style={{ fontSize: '20px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' }}>
        ${grandTotal.toFixed(2)}
      </div>
      {/* Vendor summary table */}
      <h2 style={sectionTitleStyle}>Vendor Summary</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Vendor</th>
            <th style={thStyle}># of Invoices</th>
            <th style={thStyle}>Total $ Amount</th>
          </tr>
        </thead>
        <tbody>
          {vendorTotals.map((v) => (
            <tr key={v.vendor}>
              <td style={tdStyle}>{v.vendor}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{v.invoices}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>${v.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}