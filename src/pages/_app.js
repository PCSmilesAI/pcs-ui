import React, { useState, useEffect } from 'react';
import { AuthProvider } from '../context/AuthContext';
import RequireAuth from '../components/RequireAuth';
import NavBar from '../components/NavBar';
import VendorDetailPage from '../pages/VendorDetailPage.jsx';
import ForMePage from '../pages/ForMePage.jsx';
import ToBePaidPage from '../pages/ToBePaidPage.jsx';
import CompletePage from '../pages/CompletePage.jsx';
import VendorsPage from '../pages/VendorsPage.jsx';
import AllInvoicesPage from '../pages/AllInvoicesPage.jsx';
import InvoiceDetailPage from '../pages/InvoiceDetailPage.jsx';
import AccountPage from '../pages/AccountPage.jsx';
import CompanyInfoPage from '../pages/CompanyInfoPage.jsx';
import PayoutAccountPage from '../pages/PayoutAccountPage.jsx';
import ReportsPage from '../pages/ReportsPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import SignupPage from '../pages/SignupPage.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import '../index.css';

// The main app logic, merged into Next.js _app.js
export default function App({ Component, pageProps, router }) {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState('signup');

  // Initialize auth state on mount
  useEffect(() => {
    const logged = sessionStorage.getItem('loggedInUser');
    if (logged) {
      setIsAuthenticated(true);
      return;
    }
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    setAuthMode(users.length > 0 ? 'login' : 'signup');
  }, []);

  // Dashboard navigation & UI state
  const [currentPage, setCurrentPage] = useState('forMe');
  const [previousPage, setPreviousPage] = useState('forMe');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({});

  // Handlers
  function handleRowClick(invoice) {
    setSelectedInvoice({ ...invoice, _sourcePage: currentPage });
    setPreviousPage(currentPage);
    setCurrentPage('detail');
  }
  function handleBack() {
    setSelectedInvoice(null);
    setCurrentPage(previousPage);
  }
  function toggleFilter() {
    setIsFilterOpen(!isFilterOpen);
  }
  function handleSearch(query) {
    setSearchQuery(query);
  }
  function handleApplyFilters(criteria) {
    setFilters(criteria);
    setIsFilterOpen(false);
  }

  // Only show NavBar and dashboard UI if authenticated & not on auth pages
  const isAuthPage =
    router?.pathname === '/LoginPage' || router?.pathname === '/SignupPage';

  return (
    <AuthProvider>
      {!isAuthenticated ? (
        authMode === 'login' ? (
          <LoginPage
            onLogin={() => {
              sessionStorage.setItem('loggedInUser', 'true');
              setIsAuthenticated(true);
            }}
            onSwitchMode={() => setAuthMode('signup')}
          />
        ) : (
          <SignupPage
            onSignup={() => {
              sessionStorage.setItem('loggedInUser', 'true');
              setIsAuthenticated(true);
            }}
            onSwitchMode={() => setAuthMode('login')}
          />
        )
      ) : (
        <>
          {/* Main dashboard panel */}
          <div
            style={{
              minHeight: '100vh',
              backgroundColor: '#edf3f8',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
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
              <NavBar
                currentPage={currentPage}
                onChangePage={setCurrentPage}
                onToggleFilter={toggleFilter}
                onSearch={handleSearch}
                onLogout={() => {
                  sessionStorage.removeItem('loggedInUser');
                  setIsAuthenticated(false);
                  setAuthMode('login');
                }}
              />
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
                      setSelectedVendor(vendorRow.name);
                      setCurrentPage('vendorDetail');
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
                {currentPage === 'vendorDetail' && selectedVendor && (
                  <VendorDetailPage
                    vendor={selectedVendor}
                    onBack={() => setCurrentPage('vendors')}
                    onRowClick={handleRowClick}
                  />
                )}
                {currentPage === 'account' && <AccountPage />}
                {currentPage === 'companyInfo' && <CompanyInfoPage />}
                {currentPage === 'payoutAccount' && <PayoutAccountPage />}
                {currentPage === 'reports' && <ReportsPage />}
              </div>
            </div>
            <FilterPanel
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              onApplyFilters={handleApplyFilters}
            />
          </div>
        </>
      )}
    </AuthProvider>
  );
}
