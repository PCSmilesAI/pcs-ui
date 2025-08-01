import React, { useState, useEffect, useRef } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * Navigation bar component. Renders the application title, tab
 * controls for switching between pages and a set of utility
 * actions on the right (all invoices link, search, filter and
 * account dropdown). The selected tab is highlighted with the
 * primary colour and the all invoices button is styled in the
 * same manner when selected.
 *
 * Props:
 *  - currentPage: string identifying the current active page
 *  - onChangePage: function(page:string) called when a tab is clicked
 *  - onToggleFilter: function() called when the filter icon is clicked
 */
export default function NavBar({ currentPage, onChangePage, onToggleFilter }) {
  // Control visibility of the account dropdown
  const [isAccountOpen, setIsAccountOpen] = useState(false);
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

  // Tab definitions with labels and corresponding page keys
  const tabs = [
    { label: 'For Me', key: 'forMe' },
    { label: 'To Be Paid', key: 'toBePaid' },
    { label: 'Complete', key: 'complete' },
    { label: 'Vendors', key: 'vendors' },
  ];

  /**
   * Helper for rendering a pill-shaped tab button. When active it
   * receives a filled background; otherwise it has a transparent
   * background with a blue border. On hover the background
   * lightens slightly.
   */
  const renderTab = (tab) => {
    const isActive = currentPage === tab.key;
    const baseClasses =
      'px-4 py-2 rounded-full text-sm font-medium transition-colors';
    const activeClasses =
      'bg-primary text-white border border-primary';
    const inactiveClasses =
      'bg-white text-primary border border-primary hover:bg-secondary';
    return (
      <button
        key={tab.key}
        className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        onClick={() => onChangePage(tab.key)}
      >
        {tab.label}
      </button>
    );
  };

  // Render the special all invoices button separately. It is not part
  // of the standard tab set but behaves similarly in terms of
  // styling. When the currentPage is allInvoices the button is
  // highlighted.
  const renderAllInvoicesButton = () => {
    const isActive = currentPage === 'allInvoices';
    const base = 'px-4 py-2 rounded-full text-sm font-medium transition-colors';
    const active = 'bg-primary text-white border border-primary';
    const inactive = 'bg-white text-primary border border-primary hover:bg-secondary';
    return (
      <button
        className={`${base} ${isActive ? active : inactive}`}
        onClick={() => onChangePage('allInvoices')}
      >
        All Invoices
      </button>
    );
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Left section: title and navigation tabs */}
        <div className="flex items-center space-x-6">
          <h1 className="text-2xl font-semibold text-primary whitespace-nowrap">
            PCS AI Dashboard
          </h1>
          <nav className="flex items-center space-x-2">
            {tabs.map(renderTab)}
          </nav>
        </div>
        {/* Right section: all invoices button, search, filter, account */}
        <div className="flex items-center space-x-4">
          {renderAllInvoicesButton()}
          {/* Search button: currently non-functional */}
          <button
            className="text-primary hover:text-primary focus:outline-none"
            aria-label="Search"
          >
            <i className="fas fa-search text-lg"></i>
          </button>
          {/* Filter button: toggles filter panel */}
          <button
            onClick={onToggleFilter}
            className="text-primary hover:text-primary focus:outline-none"
            aria-label="Filters"
          >
            <i className="fas fa-filter text-lg"></i>
          </button>
          {/* Account menu */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsAccountOpen(!isAccountOpen)}
              className="text-primary hover:text-primary focus:outline-none w-8 h-8 flex items-center justify-center rounded-full border border-primary"
              aria-label="Account"
            >
              <i className="fas fa-user"></i>
            </button>
            {isAccountOpen && (
              <div
                className="absolute right-0 mt-2 w-40 bg-white border border-primary rounded-md shadow-lg z-50"
                style={{ minWidth: '8rem' }}
              >
                <ul className="text-sm text-gray-700 divide-y divide-primary">
                  <li>
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-secondary"
                      onClick={() => {
                        /* no-op */
                        setIsAccountOpen(false);
                      }}
                    >
                      Account
                    </button>
                  </li>
                  <li>
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-secondary"
                      onClick={() => {
                        setIsAccountOpen(false);
                      }}
                    >
                      Company Info
                    </button>
                  </li>
                  <li>
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-secondary"
                      onClick={() => {
                        setIsAccountOpen(false);
                      }}
                    >
                      Payout Account
                    </button>
                  </li>
                  <li>
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-secondary"
                      onClick={() => {
                        setIsAccountOpen(false);
                      }}
                    >
                      Reports
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}