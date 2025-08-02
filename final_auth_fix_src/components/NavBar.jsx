import React, { useState, useEffect, useRef } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

// Navigation bar implemented with inline styles. This component avoids
// reliance on Tailwind so that styling always appears even when
// Tailwind isn't processed. It exposes the same props as before.
export default function NavBar({ currentPage, onChangePage, onToggleFilter, onSearch, onLogout }) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const dropdownRef = useRef(null);

  // Close the account menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsAccountOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Tab definitions
  const tabs = [
    { label: 'For Me', key: 'forMe' },
    { label: 'To Be Paid', key: 'toBePaid' },
    { label: 'Complete', key: 'complete' },
    { label: 'Vendors', key: 'vendors' },
  ];

  // Render a single tab button with inline styles
  const renderTab = (tab) => {
    const isActive = currentPage === tab.key;
    const baseStyle = {
      padding: '8px 16px',
      borderRadius: '9999px',
      fontSize: '14px',
      fontWeight: 500,
      marginRight: '8px',
      border: '1px solid #357ab2',
      cursor: 'pointer',
    };
    const activeStyle = {
      ...baseStyle,
      backgroundColor: '#357ab2',
      color: '#ffffff',
    };
    const inactiveStyle = {
      ...baseStyle,
      backgroundColor: '#ffffff',
      color: '#357ab2',
    };
    return (
      <button
        key={tab.key}
        style={isActive ? activeStyle : inactiveStyle}
        onClick={() => onChangePage(tab.key)}
      >
        {tab.label}
      </button>
    );
  };

  // Render All Invoices button
  const renderAllInvoicesButton = () => {
    const isActive = currentPage === 'allInvoices';
    const baseStyle = {
      padding: '8px 16px',
      borderRadius: '9999px',
      fontSize: '14px',
      fontWeight: 500,
      border: '1px solid #357ab2',
      cursor: 'pointer',
    };
    const activeStyle = {
      ...baseStyle,
      backgroundColor: '#357ab2',
      color: '#ffffff',
    };
    const inactiveStyle = {
      ...baseStyle,
      backgroundColor: '#ffffff',
      color: '#357ab2',
    };
    return (
      <button
        style={isActive ? activeStyle : inactiveStyle}
        onClick={() => onChangePage('allInvoices')}
      >
        All Invoices
      </button>
    );
  };

  // Inline styles for the nav container and elements
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid #357ab2',
    backgroundColor: '#ffffff',
  };
  const titleStyle = {
    fontSize: '24px',
    fontWeight: 600,
    color: '#357ab2',
    marginRight: '24px',
    whiteSpace: 'nowrap',
  };
  const iconButtonStyle = {
    color: '#357ab2',
    background: 'none',
    border: 'none',
    padding: '8px',
    cursor: 'pointer',
    fontSize: '16px',
  };
  const accountButtonStyle = {
    ...iconButtonStyle,
    width: '32px',
    height: '32px',
    border: '1px solid #357ab2',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const dropdownStyle = {
    position: 'absolute',
    right: 0,
    marginTop: '4px',
    width: '160px',
    backgroundColor: '#ffffff',
    border: '1px solid #357ab2',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    zIndex: 50,
  };
  const dropdownItemStyle = {
    width: '100%',
    textAlign: 'left',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
  };
  // Style for the search input when it is shown
  const searchInputStyle = {
    border: '1px solid #357ab2',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '14px',
    marginLeft: '8px',
    outline: 'none',
    width: '180px',
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={titleStyle}>PCS AI Dashboard</span>
        <nav style={{ display: 'flex', alignItems: 'center' }}>
          {tabs.map(renderTab)}
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {renderAllInvoicesButton()}
        {/* Search icon toggles display of search input */}
        <button
          style={iconButtonStyle}
          aria-label="Search"
          onClick={() => setIsSearchOpen(!isSearchOpen)}
        >
          <i className="fas fa-search"></i>
        </button>
        {isSearchOpen && (
          <input
            type="text"
            placeholder="Search..."
            value={searchValue}
            onChange={(e) => {
              const val = e.target.value;
              setSearchValue(val);
              // propagate search term to parent
              if (onSearch) onSearch(val);
            }}
            onBlur={() => setIsSearchOpen(false)}
            style={searchInputStyle}
          />
        )}
        <button onClick={onToggleFilter} style={iconButtonStyle} aria-label="Filters">
          <i className="fas fa-filter"></i>
        </button>
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            style={accountButtonStyle}
            aria-label="Account"
          >
            <i className="fas fa-user"></i>
          </button>
          {isAccountOpen && (
            <div style={dropdownStyle}>
              {/* Account menu items and logout */}
              {[
                { label: 'Account', key: 'account' },
                { label: 'Company Info', key: 'companyInfo' },
                { label: 'Payout Account', key: 'payoutAccount' },
                { label: 'Reports', key: 'reports' },
              ].map(({ label, key }) => (
                <button
                  key={key}
                  style={dropdownItemStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f7fc')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => {
                    setIsAccountOpen(false);
                    if (onChangePage) onChangePage(key);
                  }}
                >
                  {label}
                </button>
              ))}
              {/* Logout option */}
              <button
                key="logout"
                style={dropdownItemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f7fc')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={() => {
                  setIsAccountOpen(false);
                  if (onLogout) onLogout();
                }}
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}