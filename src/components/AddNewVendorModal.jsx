import React from 'react';

/**
 * Modal component for "Add New Vendor" action.
 * Displays a message and link to create a new vendor in QuickBooks.
 */
export default function AddNewVendorModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const qboVendorCreateUrl = 'https://app.qbo.intuit.com/app/vendorcreate';

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  };

  const modalStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '450px',
    width: '90%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    textAlign: 'center',
  };

  const iconStyle = {
    width: '64px',
    height: '64px',
    backgroundColor: '#e0f2fe',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  };

  const titleStyle = {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '12px',
  };

  const messageStyle = {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '24px',
    lineHeight: '1.5',
  };

  const linkButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#2ca01c',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '8px',
    textDecoration: 'none',
    transition: 'background-color 0.2s',
    marginBottom: '16px',
  };

  const cancelButtonStyle = {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={modalStyle}>
        <div style={iconStyle}>
          <svg 
            width="32" 
            height="32" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#0284c7" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </div>
        
        <h2 style={titleStyle}>Add New Vendor</h2>
        
        <p style={messageStyle}>
          Navigate to QuickBooks to add a new vendor. Once added, refresh this page to see the new vendor in the dropdown.
        </p>
        
        <a
          href={qboVendorCreateUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={linkButtonStyle}
          onMouseOver={(e) => e.target.style.backgroundColor = '#239116'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#2ca01c'}
        >
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Open QuickBooks
        </a>
        
        <div>
          <button
            onClick={onClose}
            style={cancelButtonStyle}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#f8fafc';
              e.target.style.borderColor = '#cbd5e1';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.borderColor = '#e2e8f0';
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


