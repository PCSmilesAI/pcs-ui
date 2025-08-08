import React, { useState } from 'react';
import NavBar from './components/NavBar.jsx';
import ForMePage from './pages/ForMePage.jsx';
import ToBePaidPage from './pages/ToBePaidPage.jsx';
import CompletePage from './pages/CompletePage.jsx';
import VendorsPage from './pages/VendorsPage.jsx';
import AllInvoicesPage from './pages/AllInvoicesPage.jsx';
import InvoiceDetailPage from './pages/InvoiceDetailPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import CompanyInfoPage from './pages/CompanyInfoPage.jsx';
import PayoutAccountPage from './pages/PayoutAccountPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import FilterPanel from './components/FilterPanel.jsx';

/*
 * Top level application component. This component holds the
 * navigation state and delegates rendering of individual pages
 * based on which tab has been selected. When a row in a table
 * is clicked the current page is temporarily replaced with
 * the invoice detail view. A simple previousPage state is
 * maintained so that the user can navigate back from the
 * detail screen.
 */
export default function App() {
  /**
   * Authentication state. When false the application will render
   * either the login or signup view depending on whether any users
   * exist in local storage. When true the main dashboard UI is
   * presented. The authMode state tracks which auth view to
   * display ('login' or 'signup').
   */
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState('signup');

  // Initialize auth state on mount
  React.useEffect(() => {
    console.log('🔐 App: Initializing authentication state...');
    // Check session storage for a logged in user to persist session
    const logged = sessionStorage.getItem('loggedInUser');
    console.log('🔐 App: Session storage loggedInUser:', logged);
    if (logged) {
      console.log('✅ App: User is authenticated from session storage');
      setIsAuthenticated(true);
      return;
    }
    // If there are existing users choose login, otherwise signup
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    console.log('👥 App: Found users in localStorage:', users.length);
    setAuthMode(users.length > 0 ? 'login' : 'signup');
  }, []);

  /**
   * Dashboard navigation state. Only relevant when authenticated.
   * Possible page identifiers: forMe, toBePaid, complete, vendors,
   * allInvoices, detail, account, companyInfo, payoutAccount, reports
   */
  const [currentPage, setCurrentPage] = useState('forMe');
  const [previousPage, setPreviousPage] = useState('forMe');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // Search query entered via the nav bar
  const [searchQuery, setSearchQuery] = useState('');
  // Filter criteria selected from the filter panel
  const [filters, setFilters] = useState({});

  /**
   * Handle row click from tables. Stores the selected invoice and
   * switches to the detail page. The previous page is remembered
   * so the user can return to the correct list after viewing an
   * invoice.
   *
   * @param {Object} invoice - The invoice data associated with the row.
   */
  function handleRowClick(invoice) {
    // Preserve the source page to help the detail view render correct action buttons
    setSelectedInvoice({ ...invoice, _sourcePage: currentPage });
    setPreviousPage(currentPage);
    setCurrentPage('detail');
  }

  /**
   * Navigate back from the invoice detail screen.
   */
  function handleBack() {
    setSelectedInvoice(null);
    setCurrentPage(previousPage);
  }

  /**
   * Toggle the filter panel visibility. The filter panel slides in
   * from the right on large screens and overlays the content on
   * smaller devices. Sorting icons and other conditional UI
   * elements can listen to this state.
   */
  function toggleFilter() {
    setIsFilterOpen(!isFilterOpen);
  }

  /**
   * Handle changes to the search input. This value is passed to
   * individual pages which filter their data accordingly.
   */
  function handleSearch(query) {
    setSearchQuery(query);
  }

  /**
   * Handle application of filter criteria. When the user clicks
   * Apply in the filter panel we update our filter state and
   * close the panel.
   */
  function handleApplyFilters(criteria) {
    setFilters(criteria);
    setIsFilterOpen(false);
  }

  // Debug logging for page changes
  React.useEffect(() => {
    console.log('📄 App: Current page changed to:', currentPage);
  }, [currentPage]);

  React.useEffect(() => {
    console.log('🔐 App: Authentication state changed to:', isAuthenticated);
  }, [isAuthenticated]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#edf3f8',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Authentication gating: render login or signup when not authenticated */}
      {!isAuthenticated ? (
        authMode === 'login' ? (
          <LoginPage
            onLogin={() => {
              console.log('🔐 App: User logged in, setting authenticated to true');
              sessionStorage.setItem('loggedInUser', 'true');
              setIsAuthenticated(true);
            }}
            onSwitchMode={() => setAuthMode('signup')}
          />
        ) : (
          <SignupPage
            onSignup={() => {
              console.log('🔐 App: User signed up, setting authenticated to true');
              sessionStorage.setItem('loggedInUser', 'true');
              setIsAuthenticated(true);
            }}
            onSwitchMode={() => setAuthMode('login')}
          />
        )
      ) : (
        <>
          {/* Main white panel that contains the navigation bar and page content */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              borderLeft: '1px solid #357ab2',
              borderRight: '1px solid #357ab2',
              borderBottom: '1px solid #357ab2',
              overflow: 'hidden',
            }}
          >
            {/* Navigation bar sits at the top of the panel */}
            <NavBar
              currentPage={currentPage}
              onChangePage={(page) => {
                console.log('🔄 App: Changing page from', currentPage, 'to', page);
                setCurrentPage(page);
              }}
              onToggleFilter={toggleFilter}
              onSearch={handleSearch}
              onLogout={() => {
                console.log('🔐 App: User logging out, clearing session');
                // Clear current session and return to login page
                sessionStorage.removeItem('loggedInUser');
                setIsAuthenticated(false);
                setAuthMode('login');
              }}
            />
            {/* Content area separated from the nav by a top border */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'auto',
                borderTop: '1px solid #357ab2',
              }}
            >
              {currentPage === 'forMe' && (
                <ForMePage
                  onRowClick={handleRowClick}
                  searchQuery={searchQuery}
                  filters={filters}
                />
              )}
              {currentPage === 'toBePaid' && (
                <ToBePaidPage
                  onRowClick={handleRowClick}
                  searchQuery={searchQuery}
                  filters={filters}
                />
              )}
              {currentPage === 'complete' && (
                <CompletePage
                  onRowClick={handleRowClick}
                  searchQuery={searchQuery}
                  filters={filters}
                />
              )}
              {currentPage === 'vendors' && (
                <VendorsPage
                  searchQuery={searchQuery}
                  filters={filters}
                  onVendorClick={(vendorRow) => {
                    // For now, open All Invoices filtered by this vendor
                    setFilters((prev) => ({ ...prev, vendor: vendorRow.name }));
                    setCurrentPage('allInvoices');
                  }}
                />
              )}
              {currentPage === 'allInvoices' && (
                <AllInvoicesPage
                  onRowClick={handleRowClick}
                  isFilterOpen={isFilterOpen}
                  searchQuery={searchQuery}
                  filters={filters}
                />
              )}
              {currentPage === 'detail' && selectedInvoice && (
                <InvoiceDetailPage invoice={selectedInvoice} onBack={handleBack} />
              )}
              {currentPage === 'account' && <AccountPage />}
              {currentPage === 'companyInfo' && <CompanyInfoPage />}
              {currentPage === 'payoutAccount' && <PayoutAccountPage />}
              {currentPage === 'reports' && <ReportsPage />}
            </div>
          </div>
          {/* Filter panel overlay */}
          <FilterPanel
            isOpen={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
            onApplyFilters={handleApplyFilters}
          />
        </>
      )}
    </div>
  );
}