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
export default function FilterPanel({ isOpen, onClose, onApplyFilters }) {
  // Only render when open. We use inline styles for the overlay and
  // panel so that the presentation is independent of any CSS build.
  if (!isOpen) return null;

  // Local state for each filter field. These are tracked so that
  // we can return the selected values when the user clicks Apply.
  const [vendor, setVendor] = React.useState('');
  const [minAmount, setMinAmount] = React.useState('');
  const [maxAmount, setMaxAmount] = React.useState('');
  const [office, setOffice] = React.useState('');
  const [dueStart, setDueStart] = React.useState('');
  const [dueEnd, setDueEnd] = React.useState('');
  const [category, setCategory] = React.useState('');
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
          <select
            style={inputStyle}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          >
            <option value="">Choose options</option>
            <option value="Artisan Dental">Artisan Dental</option>
            <option value="Exodus Dental Solutions">Exodus Dental Solutions</option>
            <option value="Henry Schein">Henry Schein</option>
          </select>
        </div>
        {/* Min Amount */}
        <div>
          <label style={labelStyle}>Min Amount</label>
          <input
            type="number"
            placeholder="$"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            style={inputStyle}
          />
        </div>
        {/* Max Amount */}
        <div>
          <label style={labelStyle}>Max Amount</label>
          <input
            type="number"
            placeholder="$"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            style={inputStyle}
          />
        </div>
        {/* Office */}
        <div>
          <label style={labelStyle}>Office</label>
          <select
            style={inputStyle}
            value={office}
            onChange={(e) => setOffice(e.target.value)}
          >
            <option value="">Choose options</option>
            <option value="Roseburg">Roseburg</option>
            <option value="Lebanon">Lebanon</option>
            <option value="Eugene">Eugene</option>
          </select>
        </div>
        {/* Due Date Start */}
        <div>
          <label style={labelStyle}>Due Date Start</label>
          <input
            type="date"
            value={dueStart}
            onChange={(e) => setDueStart(e.target.value)}
            style={inputStyle}
          />
        </div>
        {/* Due Date End */}
        <div>
          <label style={labelStyle}>Due Date End</label>
          <input
            type="date"
            value={dueEnd}
            onChange={(e) => setDueEnd(e.target.value)}
            style={inputStyle}
          />
        </div>
        {/* Category */}
        <div>
          <label style={labelStyle}>Category</label>
          <select
            style={inputStyle}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Choose options</option>
            <option value="Dental Lab">Dental Lab</option>
            <option value="Dental Supplies">Dental Supplies</option>
          </select>
        </div>

        {/* Apply button */}
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => {
              // Build a filter criteria object and call onApplyFilters
              const criteria = {
                vendor,
                minAmount,
                maxAmount,
                office,
                dueStart,
                dueEnd,
                category,
              };
              if (onApplyFilters) {
                onApplyFilters(criteria);
              }
            }}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#357ab2',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
      </aside>
    </div>
  );
}