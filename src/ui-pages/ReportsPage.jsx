import React, { useState, useMemo, useEffect } from 'react';

/**
 * Reports page summarises invoice data into charts and tables. The
 * dataset below mirrors the example invoices used throughout the
 * application. Users can switch between all‑time, year‑to‑date and
 * month‑to‑date views. Charts are rendered using simple divs with
 * relative widths to approximate a pie chart and bar chart.
 */
export default function ReportsPage() {
  // Dynamically load all invoices from the same source as "All Invoices"
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Use the same API endpoint as AllInvoicesPage to get current invoice data
        const params = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams();
        params.set('limit', '5000');
        const response = await fetch(`/api/invoices/visible?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`Failed to load invoices: ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok) throw new Error(payload?.error || 'Failed to load invoices');
        const data = Array.isArray(payload.invoices) ? payload.invoices : [];

        // Map to generic structure used by reports
        // Only include OUTSTANDING (unpaid) invoices, matching VendorsPage logic
        const mapped = (data || []).map((inv) => {
          // Get the effective vendor name (corrected takes precedence over parsed)
          const vendorName = inv.vendor_name || inv.vendor || 'Unknown';

          // Parse invoice_date (typically ISO format from API, but handle MM/DD/YY format too)
          let isoDate = '2000-01-01';
          if (inv.invoice_date) {
            const dateStr = String(inv.invoice_date).trim();
            // Check if it's already ISO format (YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
              isoDate = dateStr.substring(0, 10);
            } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateStr)) {
              // Handle MM/DD/YY or MM/DD/YYYY format
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                const m = parts[0].padStart(2, '0');
                const d = parts[1].padStart(2, '0');
                const yy = parts[2];
                const y = yy.length === 2 ? `20${yy}` : yy;
                isoDate = `${y}-${m}-${d}`;
              }
            }
          }

          // Get the effective amount (use invoice_total or total, parse if string)
          // Note: API returns invoice_total and total as REAL (dollars), not cents
          const rawTotal = inv.invoice_total ?? inv.total;
          const amount = typeof rawTotal === 'number'
            ? rawTotal // Already in dollars from API
            : parseFloat(String(rawTotal || '0').replace(/[^0-9.-]/g, '')) || 0;

          // Only include outstanding (unpaid) invoices
          const isPaid = inv.status === 'paid';
          const outstandingAmount = isPaid ? 0 : amount;

          return {
            vendor: vendorName,
            amount: outstandingAmount,
            date: isoDate,
            isPaid,
          };
        });
        setInvoices(mapped);
        setError('');
      } catch (e) {
        setError(e.message || 'Failed to load reports');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch total amount paid from Stripe
  useEffect(() => {
    const fetchPaidAmount = async () => {
      try {
        const response = await fetch('/api/stripe/status', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          // Calculate total from successful charges
          if (data.charges && Array.isArray(data.charges)) {
            const total = data.charges
              .filter(c => c.status === 'succeeded')
              .reduce((sum, c) => sum + (c.amount || 0), 0);
            setTotalPaid(total / 100); // Convert from cents to dollars
          }
        }
      } catch (err) {
        console.error('Failed to fetch Stripe payment history:', err);
        // Don't show error to user, just leave as 0
      }
    };
    fetchPaidAmount();
  }, []);

  // Determine current month and year for filtering.
  const currentDate = new Date();
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
    return invoices.filter(({ date }) => {
      const dt = new Date(date);
      if (range === 'year') {
        return dt.getFullYear() === currentYear;
      }
      if (range === 'month') {
        return dt.getFullYear() === currentYear && dt.getMonth() === currentMonth;
      }
      return true; // all time
    });
  }, [range, invoices, currentMonth, currentYear]);

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
      {loading && (
        <div style={{ marginBottom: '12px', color: '#357ab2' }}>Loading reports…</div>
      )}
      {error && (
        <div style={{ marginBottom: '12px', color: '#dc2626' }}>Error: {error}</div>
      )}
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
      {/* Total amount paid (from Stripe) */}
      <h2 style={sectionTitleStyle}>Total Amount Paid (via Stripe)</h2>
      <div style={{ fontSize: '20px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' }}>
        ${totalPaid.toFixed(2)}
      </div>

      {/* Outstanding amount (unpaid invoices) */}
      <h2 style={sectionTitleStyle}>Outstanding Amount (Unpaid Invoices)</h2>
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