'use client';
import React, { useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import NavBar from './NavBar';
import { InvoiceClickProvider } from '../context/InvoiceClickContext';
import { InvoiceDataProvider, useInvoiceData } from '../context/InvoiceDataContext';
import FilterPanel from './FilterPanel.jsx'

export default function AppLayout({ children }) {
  // Get hooks at top level - these must be called unconditionally
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  const [currentPage, setCurrentPage] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({});

  // Determine if this is an auth page or vendor onboarding success page
  const isAuthPage = pathname === '/LoginPage' || pathname === '/SignupPage';
  const isVendorOnboardingSuccess = pathname === '/VendorOnboardingSuccess';

  useEffect(() => {
    const path = pathname.split('/')[1] || 'ForMePage';

    // Map URL paths to NavBar page keys
    const pageMapping = {
      'ForMePage': 'forMe',
      'ToBePaidPage': 'toBePaid',
      'CompletePage': 'complete',
      'VendorsPage': 'vendors',
      'AllInvoicesPage': 'allInvoices',
      'AccountPage': 'account',
      'CompanyInfoPage': 'companyInfo',
      'PayoutAccountPage': 'payoutAccount',
      'ReportsPage': 'reports',
      'RolesPage': 'roles',
      'roles': 'roles',
      'ConnectionsPage': 'connections'
    };

    // If on InvoiceDetailPage, check the 'from' query parameter to determine which tab to highlight
    if (path === 'InvoiceDetailPage') {
      const from = sp.get('from');
      if (from) {
        // Extract the page name from the 'from' parameter (e.g., "/ToBePaidPage" -> "ToBePaidPage")
        const fromPath = from.split('?')[0].split('/').filter(Boolean)[0];
        setCurrentPage(pageMapping[fromPath] || 'forMe');
      } else {
        setCurrentPage('forMe');
      }
    } else {
      setCurrentPage(pageMapping[path] || 'forMe');
    }
  }, [pathname, sp]);

  const handleChangePage = (pageKey) => {
    // Map NavBar page keys to URL paths
    const urlMapping = {
      'forMe': 'ForMePage',
      'toBePaid': 'ToBePaidPage',
      'complete': 'CompletePage',
      'vendors': 'VendorsPage',
      'allInvoices': 'AllInvoicesPage',
      'account': 'AccountPage',
      'companyInfo': 'CompanyInfoPage',
      'payoutAccount': 'PayoutAccountPage',
      'reports': 'ReportsPage',
      'roles': 'roles',
      'connections': 'ConnectionsPage'
    };
    
    const urlPath = urlMapping[pageKey] || 'ForMePage';
    // Preserve existing query params (e.g., ?email=...)
    try {
      const params = new URLSearchParams(sp.toString());
      const query = params.toString();
      router.push(`/${urlPath}${query ? `?${query}` : ''}`);
    } catch (_) {
      router.push(`/${urlPath}`);
    }
  };

  const handleToggleFilter = () => {
    setIsFilterOpen((v) => !v);
  };

  const handleSearch = (query) => {
    console.log('Search query:', query);
  };

  const handleLogout = () => {
    console.log('Logout clicked');
    router.push('/LoginPage');
  };

  // Inner component that uses the InvoiceData context
  function FilterPanelWrapper(props) {
    const { invoices } = useInvoiceData();
    return <FilterPanel {...props} invoices={invoices} />;
  }

  // Render content with or without InvoiceClickProvider based on page type
  const content = (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Render NavBar only on non-auth and non-vendor-onboarding pages */}
      {!isAuthPage && !isVendorOnboardingSuccess && (
        <NavBar
          currentPage={currentPage}
          onChangePage={handleChangePage}
          onToggleFilter={handleToggleFilter}
          onSearch={handleSearch}
          onLogout={handleLogout}
        />
      )}
      {/* Render FilterPanel only on non-auth and non-vendor-onboarding pages */}
      {!isAuthPage && !isVendorOnboardingSuccess && (
        <FilterPanelWrapper
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          onApplyFilters={(criteria) => {
            setFilters(criteria || {});
            setIsFilterOpen(false);
            try {
              // Mirror filters into the URL so pages can read them reliably
              const params = new URLSearchParams(sp.toString());
              const keys = ['vendor','office','category','minAmount','maxAmount','dueWithin','ach','hasAttachment'];
              keys.forEach((k) => {
                const v = (criteria && criteria[k]) ? String(criteria[k]).trim() : '';
                if (v) params.set(k, v); else params.delete(k);
              });
              router.replace(`${pathname}?${params.toString()}`);
            } catch (applyError) {
              console.error('Failed to mirror filter parameters in URL:', applyError);
            }
          }}
        />
      )}
      <main style={{ flex: 1, padding: (isAuthPage || isVendorOnboardingSuccess) ? '0' : '20px' }}>
        {React.isValidElement(children) ? React.cloneElement(children, { filters }) : children}
      </main>
    </div>
  );

  // Only wrap with InvoiceClickProvider on non-auth and non-vendor-onboarding pages
  if (isAuthPage || isVendorOnboardingSuccess) {
    return content;
  }

  return (
    <InvoiceDataProvider>
      <InvoiceClickProvider>
        {content}
      </InvoiceClickProvider>
    </InvoiceDataProvider>
  );
}
