import React from 'react';

/**
 * Sliding filter panel. When open this component covers the
 * viewport with a semi-transparent overlay and reveals a panel
 * anchored to the left hand side. The panel contains a series
 * of filter controls that mirror those in the provided wireframe.
 * At present the controls do not perform any filtering; they are
 * purely illustrative and can be wired up to state as needed.
 *
 * Props:
 *  - isOpen: boolean controlling visibility
 *  - onClose: function() called when the overlay is clicked
 */
export default function FilterPanel({ isOpen, onClose }) {
  // Only render when open. We use inline styles for the overlay and
  // panel so that the presentation is independent of any CSS build.
  if (!isOpen) return null;
  // Base styles
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    display: 'flex',
  };
  const dimStyle = {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  };
  const panelStyle = {
    width: '320px',
    maxWidth: '100%',
    backgroundColor: '#ffffff',
    borderLeft: '1px solid #357ab2',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    overflowY: 'auto',
    padding: '16px',
  };
  const headerStyle = {
    fontSize: '20px',
    fontWeight: '600',
    color: '#357ab2',
    marginBottom: '16px',
  };
  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#4a5568',
    marginBottom: '4px',
  };
  const inputStyle = {
    width: '100%',
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '14px',
    marginBottom: '12px',
  };
  return (
    <div style={overlayStyle} aria-modal="true" role="dialog">
      {/* Overlay to dim the rest of the interface */}
      <div style={dimStyle} onClick={onClose} />
      {/* Actual filter panel */}
      <aside style={panelStyle}>
        <h2 style={headerStyle}>Filters</h2>
        {/* Vendor */}
        <div>
          <label style={labelStyle}>Vendor</label>
          <select style={inputStyle}>
            <option value="">Choose options</option>
            <option>Artisan Dental</option>
            <option>Exodus Dental Solutions</option>
            <option>Henry Schein</option>
          </select>
        </div>
        {/* Min Amount */}
        <div>
          <label style={labelStyle}>Min Amount</label>
          <input type="number" placeholder="$" style={inputStyle} />
        </div>
        {/* Max Amount */}
        <div>
          <label style={labelStyle}>Max Amount</label>
          <input type="number" placeholder="$" style={inputStyle} />
        </div>
        {/* Office */}
        <div>
          <label style={labelStyle}>Office</label>
          <select style={inputStyle}>
            <option value="">Choose options</option>
            <option>Roseburg</option>
            <option>Lebanon</option>
            <option>Eugene</option>
          </select>
        </div>
        {/* Due Date Start */}
        <div>
          <label style={labelStyle}>Due Date Start</label>
          <input type="date" style={inputStyle} />
        </div>
        {/* Due Date End */}
        <div>
          <label style={labelStyle}>Due Date End</label>
          <input type="date" style={inputStyle} />
        </div>
        {/* Category */}
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle}>
            <option value="">Choose options</option>
            <option>Dental Lab</option>
            <option>Dental Supplies</option>
          </select>
        </div>
      </aside>
    </div>
  );
}