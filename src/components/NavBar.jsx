'use client';
import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUserRole } from '../context/UserRoleContext';
import NotificationBell from './NotificationBell';
import '@fortawesome/fontawesome-free/css/all.min.css';

// Navigation bar implemented with inline styles. This component avoids
// reliance on Tailwind so that styling always appears even when
// Tailwind isn't processed. It exposes the same props as before.
function NavBarInner({
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
  // Get user permissions from context
  const { permissions } = useUserRole();
  
  // Minimal logic-only additions to keep UI identical
  const router = useRouter();
  const pathname = usePathname();
  const [sp, setSp] = useState(null);

  // Get search params safely on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSp(new URLSearchParams(window.location.search));
    }
  }, [pathname]);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const dropdownRef = useRef(null);
  const [userEmail, setUserEmail] = useState('');

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('loggedInUser');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.email) {
          setUserEmail(String(parsed.email).toLowerCase());
        }
      }
    } catch (_) {
      // ignore storage parsing issues
    }
  }, []);

  // Fallback: if email is present in URL (?email=...), adopt it and persist
  useEffect(() => {
    if (typeof window === 'undefined' || !sp) return;
    try {
      const urlEmail = sp.get('email');
      const normalised = urlEmail ? String(urlEmail).trim().toLowerCase() : '';
      if (normalised && normalised !== userEmail) {
        setUserEmail(normalised);
        try {
          window.localStorage.setItem('loggedInUser', JSON.stringify({ email: normalised, name: normalised }));
          document.cookie =
            'loggedInUser=' + encodeURIComponent(JSON.stringify({ email: normalised, name: normalised })) + '; path=/';
        } catch (_) {
          // ignore persistence errors
        }
      }
    } catch (_) {
      // ignore URL parsing errors
    }
  }, [sp, userEmail]);

  // Use permissions from context for role-based access
  const isAdminUser = permissions.isAdmin || permissions.isAPManager;
  const isOfficeManager = permissions.isOfficeManager && !permissions.isAdmin && !permissions.isAPManager;

  // Determine which top-level module is active based on current path
  const activeModule = pathname.startsWith('/CreditCardReceiptsPage') ? 'receipts' : 'ap';

  // Module switcher: navigate to the module's landing page
  const handleModuleSwitch = (moduleKey) => {
    if (moduleKey === 'ap') {
      router.push('/ForMePage');
    } else if (moduleKey === 'receipts') {
      router.push('/CreditCardReceiptsPage');
    }
  };

  // Tab definitions - filtered based on user role
  const allTabs = [
    { label: 'For Me', key: 'forMe', showForOfficeManager: true },
    { label: 'To Be Paid', key: 'toBePaid', showForOfficeManager: false },
    { label: 'Complete', key: 'complete', showForOfficeManager: true },
    { label: 'Vendors', key: 'vendors', showForOfficeManager: false },
  ];

  // Filter tabs based on user role
  const tabs = isOfficeManager
    ? allTabs.filter(tab => tab.showForOfficeManager)
    : allTabs;

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

  // Render All Invoices button (visible to all users)
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
    borderRadius: '16px',
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
    if (!sp) return;
    const initial = sp.get('search') || '';
    setSearchValue(initial);
    // Do not auto-open input; respect UI toggle
  }, [sp]);

  // Debounce URL updates when typing
  useEffect(() => {
    if (!sp) return;
    const id = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (searchValue) params.set('search', searchValue);
      else params.delete('search');
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
    return () => clearTimeout(id);
  }, [searchValue, pathname, sp, router]);

  // Module switcher styles
  const moduleSwitcherStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginRight: '20px',
    padding: '3px',
    backgroundColor: '#f0f6fc',
    borderRadius: '9999px',
    border: '1px solid #c8dff0',
  };
  const moduleButtonBase = {
    padding: '5px 14px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    transition: 'background 0.15s, color 0.15s',
    letterSpacing: '0.01em',
  };
  const moduleButtonActive = {
    ...moduleButtonBase,
    backgroundColor: '#357ab2',
    color: '#ffffff',
  };
  const moduleButtonInactive = {
    ...moduleButtonBase,
    backgroundColor: 'transparent',
    color: '#357ab2',
  };

  return (
    <nav style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={titleStyle}>PCS AI</span>
        {/* Module switcher — top-level navigation between platform modules */}
        <div style={moduleSwitcherStyle}>
          <button
            style={activeModule === 'ap' ? moduleButtonActive : moduleButtonInactive}
            onClick={() => handleModuleSwitch('ap')}
          >
            AP Invoices
          </button>
          <button
            style={activeModule === 'receipts' ? moduleButtonActive : moduleButtonInactive}
            onClick={() => handleModuleSwitch('receipts')}
          >
            Credit Card Receipts
          </button>
        </div>
        {/* Module-specific tabs — only shown for AP Invoices module */}
        {activeModule === 'ap' && (
          <div style={tabContainerStyle}>
            {tabs.map(renderTab)}
            {renderAllInvoicesButton()}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <NotificationBell />
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
              {/* Account - visible to all */}
              <div
                style={dropdownItemStyle}
                onClick={() => {
                  setIsAccountOpen(false);
                  onChangePage('account');
                }}
              >
                Account
              </div>
              {/* Company Info - visible to all */}
              <div
                style={dropdownItemStyle}
                onClick={() => {
                  setIsAccountOpen(false);
                  onChangePage('companyInfo');
                }}
              >
                Company Info
              </div>
              {/* Reports - Admin/AP only */}
              {isAdminUser && (
                <div
                  style={dropdownItemStyle}
                  onClick={() => {
                    setIsAccountOpen(false);
                    onChangePage('reports');
                  }}
                >
                  Reports
                </div>
              )}
              {/* Roles - Admin only */}
              {permissions.canManageRoles && (
                <div
                  style={dropdownItemStyle}
                  onClick={() => {
                    setIsAccountOpen(false);
                    onChangePage('roles');
                  }}
                >
                  Roles
                </div>
              )}
              {/* Connections - Admin/AP only */}
              {isAdminUser && (
                <div
                  style={dropdownItemStyle}
                  onClick={() => {
                    setIsAccountOpen(false);
                    onChangePage('connections');
                  }}
                >
                  Connections
                </div>
              )}
              {/* QBO Export - Admin/AP only */}
              {isAdminUser && (
                <div
                  style={dropdownItemStyle}
                  onClick={() => {
                    setIsAccountOpen(false);
                    if (typeof window !== 'undefined') {
                      window.location.href = '/QboExportPage';
                    }
                  }}
                >
                  QBO Export
                </div>
              )}
              {/* Coding Templates - Admin/AP only */}
              {isAdminUser && (
                <div
                  style={dropdownItemStyle}
                  onClick={() => {
                    setIsAccountOpen(false);
                    // Navigate to coding templates page
                    if (typeof window !== 'undefined') {
                      window.location.href = '/admin/coding-templates';
                    }
                  }}
                >
                  Coding Templates
                </div>
              )}
              {/* Knowledge Base - Admin/AP only, hidden for verifier accounts */}
              {isAdminUser && userEmail !== 'laurag@pcsmiles.com' && (
                <div
                  style={dropdownItemStyle}
                  onClick={() => {
                    setIsAccountOpen(false);
                    // Navigate to knowledge base page
                    if (typeof window !== 'undefined') {
                      window.location.href = '/admin/knowledge-base';
                    }
                  }}
                >
                  Knowledge Base
                </div>
              )}
              {/* Other Documents - Admin/AP only */}
              {isAdminUser && (
                <div
                  style={dropdownItemStyle}
                  onClick={() => {
                    setIsAccountOpen(false);
                    // Navigate to other documents page
                    if (typeof window !== 'undefined') {
                      window.location.href = '/OtherDocumentsPage';
                    }
                  }}
                >
                  Other Documents
                </div>
              )}
              {/* Log Out - visible to all */}
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

// Export with Suspense wrapper to handle client-side only rendering
export default function NavBar(props) {
  return <NavBarInner {...props} />;
}
