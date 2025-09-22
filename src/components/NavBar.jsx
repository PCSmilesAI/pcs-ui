import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import '@fortawesome/fontawesome-free/css/all.min.css';

// Navigation bar implemented with inline styles. This component avoids
// reliance on Tailwind so that styling always appears even when
// Tailwind isn't processed. It exposes the same props as before.
export default function NavBar({
  currentPage,
  onChangePage = () => { 
    if (process.env.NODE_ENV !== 'production') {
      console.warn('NavBar: onChangePage prop was not provided.');
    }
  },
  onToggleFilter,
  onSearch,
  onLogout
}) {
  // Minimal logic-only additions to keep UI identical
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
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
  const tabContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    marginLeft: '24px',
  };
  const searchIconStyle = {
    fontSize: '18px',
    color: '#357ab2',
    marginLeft: '16px',
    cursor: 'pointer',
  };
  const filterIconStyle = {
    fontSize: '18px',
    color: '#357ab2',
    marginLeft: '16px',
    cursor: 'pointer',
  };
  const accountSectionStyle = {
    position: 'relative',
    marginLeft: '16px',
    cursor: 'pointer',
  };
  const accountDropdownStyle = {
    position: 'absolute',
    right: 0,
    top: '32px',
    background: '#fff',
    border: '1px solid #357ab2',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(53,122,178,0.08)',
    zIndex: 10,
    minWidth: '170px',
    padding: '8px 0',
  };
  const dropdownItemStyle = {
    padding: '8px 16px',
    cursor: 'pointer',
    color: '#357ab2',
    fontSize: '14px',
    fontWeight: 500,
    background: 'none',
    border: 'none',
    textAlign: 'left',
    width: '100%',
  };
  const searchInputStyle = {
    padding: '6px 12px',
    borderRadius: '9999px',
    border: '1px solid #357ab2',
    fontSize: '14px',
    marginLeft: '8px',
    outline: 'none',
  };

  // Handle account dropdown click
  const handleAccountClick = () => {
    setIsAccountOpen((prev) => !prev);
  };

  // Handle search icon click
  const handleSearchClick = () => {
    setIsSearchOpen((prev) => !prev);
  };

  // Handle search input change
  const handleSearchInputChange = (e) => {
    setSearchValue(e.target.value);
    if (onSearch) onSearch(e.target.value);
  };

  // Keep local searchValue in sync with URL when navigating back/forward
  useEffect(() => {
    const initial = sp.get('search') || '';
    setSearchValue(initial);
    // Do not auto-open input; respect UI toggle
  }, [sp]);

  // Debounce URL updates when typing
  useEffect(() => {
    const id = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (searchValue) params.set('search', searchValue);
      else params.delete('search');
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
    return () => clearTimeout(id);
  }, [searchValue, pathname, sp, router]);

  return (
    <nav style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={titleStyle}>PCS AI Dashboard</span>
        <div style={tabContainerStyle}>
          {tabs.map(renderTab)}
          {renderAllInvoicesButton()}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* Search icon and search field */}
        <span
          className="fas fa-search"
          style={searchIconStyle}
          onClick={handleSearchClick}
        />
        {isSearchOpen && (
          <input
            type="text"
            style={searchInputStyle}
            value={searchValue}
            onChange={handleSearchInputChange}
            autoFocus
            placeholder="Search..."
          />
        )}
        {/* Filter icon */}
        <span
          className="fas fa-filter"
          style={filterIconStyle}
          onClick={onToggleFilter}
        />
        {/* Account section */}
        <div style={accountSectionStyle} ref={dropdownRef}>
          <span
            className="fas fa-user-circle"
            style={{ fontSize: '22px', color: '#357ab2' }}
            onClick={handleAccountClick}
          />
          {isAccountOpen && (
            <div style={accountDropdownStyle}>
              <div
                style={dropdownItemStyle}
                onClick={() => {
                  setIsAccountOpen(false);
                  onChangePage('account');
                }}
              >
                Account
              </div>
              <div
                style={dropdownItemStyle}
                onClick={() => {
                  setIsAccountOpen(false);
                  onChangePage('companyInfo');
                }}
              >
                Company Info
              </div>
              <div
                style={dropdownItemStyle}
                onClick={() => {
                  setIsAccountOpen(false);
                  onChangePage('payoutAccount');
                }}
              >
                Payout Account
              </div>
              <div
                style={dropdownItemStyle}
                onClick={() => {
                  setIsAccountOpen(false);
                  onChangePage('reports');
                }}
              >
                Reports
              </div>
              <div
                style={dropdownItemStyle}
                onClick={() => {
                  setIsAccountOpen(false);
                  onLogout();
                }}
              >
                Log Out
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
