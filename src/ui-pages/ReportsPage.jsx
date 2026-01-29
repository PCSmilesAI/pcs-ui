import React, { useState, useMemo, useEffect, useRef } from 'react';
import { fetchInvoiceQueue } from '../lib/fetchQueue';
import { parseInvoiceAmount } from '../lib/vendorUtils';

/**
 * Reports page summarises invoice data into charts and tables. The
 * dataset below mirrors the example invoices used throughout the
 * application. Users can switch between all-time, year-to-date,
 * month-to-date, or custom date range views.
 */

// Generate distinct colors using golden angle for maximum separation
function generateVendorColor(index) {
  const goldenAngle = 137.508; // degrees
  const hue = (index * goldenAngle) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export default function ReportsPage() {
  // Dynamically load all invoices from the same source as VendorsPage
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [totalPaid, setTotalPaid] = useState(0);

  // Tooltip state for vendor hover
  const [hoveredVendor, setHoveredVendor] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Custom date range state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const datePickerRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Use SAME data source as VendorsPage to ensure consistency
        const data = await fetchInvoiceQueue({ limit: 5000 });

        // Map to generic structure used by reports
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

          // Use helper to properly parse amount (handles cents vs dollars)
          const amountNum = parseInvoiceAmount(inv);

          // Track paid status
          const isPaid = inv.status === 'paid';

          return {
            vendor: vendorName,
            amount: amountNum,
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

  // Calculate total paid from completed invoices (not from Stripe)
  useEffect(() => {
    const paidTotal = invoices
      .filter(inv => inv.isPaid)
      .reduce((sum, inv) => sum + inv.amount, 0);
    setTotalPaid(paidTotal);
  }, [invoices]);

  // Close date picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine current month and year for filtering.
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Selection state: 'all', 'year', 'month', or 'custom'
  const [range, setRange] = useState('all');

  /**
   * Filter invoices according to the selected range.
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
      if (range === 'custom' && customStartDate && customEndDate) {
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999); // Include the entire end day
        return dt >= start && dt <= end;
      }
      return true; // all time
    });
  }, [range, invoices, currentMonth, currentYear, customStartDate, customEndDate]);

  /**
   * Aggregate the filtered invoices by vendor. Returns an array of
   * objects with vendor name, invoice count, totalUnpaid, and totalPaid.
   * Sorted by total amount descending (largest first).
   */
  const vendorTotals = useMemo(() => {
    const map = {};
    filteredInvoices.forEach(({ vendor, amount, isPaid }) => {
      if (!map[vendor]) {
        map[vendor] = { vendor, invoices: 0, totalUnpaid: 0, totalPaid: 0, total: 0 };
      }
      map[vendor].invoices += 1;
      if (isPaid) {
        map[vendor].totalPaid += amount;
      } else {
        map[vendor].totalUnpaid += amount;
      }
      map[vendor].total += amount;
    });
    // Sort by total amount descending (largest first)
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredInvoices]);

  // Compute overall total amount across all vendors for display and
  // percentage calculations. Guard against zero to avoid division by zero.
  const grandTotal = vendorTotals.reduce((sum, v) => sum + v.total, 0);
  const grandTotalUnpaid = vendorTotals.reduce((sum, v) => sum + v.totalUnpaid, 0);
  const grandTotalPaid = vendorTotals.reduce((sum, v) => sum + v.totalPaid, 0);

  // Handle custom date range selection
  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      setRange('custom');
      setShowDatePicker(false);
    }
  };

  const handleReset = () => {
    setRange('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setShowDatePicker(false);
  };

  // Styles
  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' };
  const sectionTitleStyle = { fontSize: '18px', fontWeight: '600', color: '#357ab2', margin: '16px 0 8px' };
  const buttonRowStyle = { display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' };
  const rangeButtonStyle = (isActive) => ({
    padding: '8px 16px',
    border: '1px solid #357ab2',
    borderRadius: '12px',
    backgroundColor: isActive ? '#357ab2' : '#ffffff',
    color: isActive ? '#ffffff' : '#357ab2',
    cursor: 'pointer',
    fontWeight: '500',
  });
  const resetButtonStyle = {
    padding: '8px 16px',
    border: '1px solid #dc2626',
    borderRadius: '12px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: '500',
  };
  const barContainerStyle = {
    width: '100%',
    height: '32px',
    display: 'flex',
    border: '1px solid #357ab2',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '16px',
    position: 'relative',
  };
  const tableContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '16px',
  };
  const tableStyle = {
    borderCollapse: 'separate',
    borderSpacing: 0,
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    borderRadius: '16px',
    overflow: 'hidden',
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
    whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    color: '#1f1f1f',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const tooltipStyle = {
    position: 'fixed',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    color: '#ffffff',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    pointerEvents: 'none',
    zIndex: 1000,
    whiteSpace: 'nowrap',
    transform: 'translate(-50%, -100%)',
    marginTop: '-10px',
  };
  const datePickerContainerStyle = {
    position: 'relative',
    display: 'inline-block',
  };
  const datePickerDropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    backgroundColor: '#ffffff',
    border: '1px solid #357ab2',
    borderRadius: '12px',
    padding: '16px',
    marginTop: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 100,
    minWidth: '280px',
  };
  const dateInputStyle = {
    padding: '8px 12px',
    border: '1px solid #cbd5e0',
    borderRadius: '8px',
    fontSize: '14px',
    width: '100%',
    marginBottom: '8px',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Reports</h1>
      {loading && (
        <div style={{ marginBottom: '12px', color: '#357ab2' }}>Loading reports...</div>
      )}
      {error && (
        <div style={{ marginBottom: '12px', color: '#dc2626' }}>Error: {error}</div>
      )}
      {/* Range selector */}
      <div style={buttonRowStyle}>
        {['all', 'year', 'month'].map((key) => (
          <button
            key={key}
            onClick={() => {
              setRange(key);
              if (key !== 'custom') {
                setCustomStartDate('');
                setCustomEndDate('');
              }
            }}
            style={rangeButtonStyle(range === key)}
          >
            {key === 'all' ? 'All Time' : key === 'year' ? 'Year to Date' : 'Month to Date'}
          </button>
        ))}
        
        {/* Custom date range */}
        <div style={datePickerContainerStyle} ref={datePickerRef}>
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            style={rangeButtonStyle(range === 'custom')}
          >
            Custom
          </button>
          {showDatePicker && (
            <div style={datePickerDropdownStyle}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#4a5568', marginBottom: '4px' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  style={dateInputStyle}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#4a5568', marginBottom: '4px' }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  style={dateInputStyle}
                />
              </div>
              <button
                onClick={handleCustomDateApply}
                disabled={!customStartDate || !customEndDate}
                style={{
                  ...rangeButtonStyle(true),
                  width: '100%',
                  opacity: (!customStartDate || !customEndDate) ? 0.5 : 1,
                  cursor: (!customStartDate || !customEndDate) ? 'not-allowed' : 'pointer',
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Reset button - only show when custom range is active */}
        {range === 'custom' && (
          <button onClick={handleReset} style={resetButtonStyle}>
            Reset
          </button>
        )}
      </div>

      {/* Show custom date range if selected */}
      {range === 'custom' && customStartDate && customEndDate && (
        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#4a5568' }}>
          Showing data from <strong>{customStartDate}</strong> to <strong>{customEndDate}</strong>
        </div>
      )}

      {/* Vendor distribution chart */}
      <h2 style={sectionTitleStyle}>Vendor Distribution</h2>
      <div style={barContainerStyle}>
        {vendorTotals.map((v, idx) => {
          const widthPercent = grandTotal ? (v.total / grandTotal) * 100 : 0;
          const color = generateVendorColor(idx);
          return (
            <div
              key={v.vendor}
              style={{
                width: `${widthPercent}%`,
                backgroundColor: color,
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => {
                setHoveredVendor(v.vendor);
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => {
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => {
                setHoveredVendor(null);
              }}
            />
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredVendor && (
        <div style={{ ...tooltipStyle, left: tooltipPos.x, top: tooltipPos.y }}>
          {hoveredVendor}
        </div>
      )}

      {/* Total amount paid */}
      <h2 style={sectionTitleStyle}>Total Amount Paid</h2>
      <div style={{ fontSize: '20px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' }}>
        ${grandTotalPaid.toFixed(2)}
      </div>

      {/* Outstanding amount (unpaid invoices) */}
      <h2 style={sectionTitleStyle}>Outstanding Amount (Unpaid Invoices)</h2>
      <div style={{ fontSize: '20px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' }}>
        ${grandTotalUnpaid.toFixed(2)}
      </div>

      {/* Vendor summary table - centered with auto width */}
      <h2 style={sectionTitleStyle}>Vendor Summary</h2>
      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Vendor</th>
              <th style={thStyle}># of Invoices</th>
              <th style={thStyle}>Total Amount Unpaid</th>
              <th style={thStyle}>Total Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            {vendorTotals.map((v) => (
              <tr key={v.vendor}>
                <td style={tdStyle}>{v.vendor}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{v.invoices}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>${v.totalUnpaid.toFixed(2)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>${v.totalPaid.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
