'use client';
import React, { useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import NavBar from './NavBar';
import { InvoiceClickProvider } from '../context/InvoiceClickContext';
import FilterPanel from './FilterPanel.jsx'

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [currentPage, setCurrentPage] = useState('');
  // QBO connection logic removed since QBO is already connected
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({});

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
      'ReportsPage': 'reports'
    };
    
    setCurrentPage(pageMapping[path] || 'forMe');
  }, [pathname]);

  // QBO status check removed since QBO is already connected

  // Check if current page is an auth page (login/signup)
  const isAuthPage = pathname === '/LoginPage' || pathname === '/SignupPage';

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
      'reports': 'ReportsPage'
    };
    
    const urlPath = urlMapping[pageKey] || 'ForMePage';
    router.push(`/${urlPath}`);
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

  return (
    <InvoiceClickProvider>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {!isAuthPage && (
          <NavBar
            currentPage={currentPage}
            onChangePage={handleChangePage}
            onToggleFilter={handleToggleFilter}
            onSearch={handleSearch}
            onLogout={handleLogout}
          />
        )}
        {!isAuthPage && (
          <FilterPanel
            isOpen={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
            onApplyFilters={(criteria) => {
              setFilters(criteria || {});
              setIsFilterOpen(false);
              try {
                // Mirror filters into the URL so pages can read them reliably
                const params = new URLSearchParams(sp.toString());
                const keys = ['vendor','office','category','minAmount','maxAmount','dueWithin'];
                keys.forEach((k) => {
                  const v = (criteria && criteria[k]) ? String(criteria[k]).trim() : '';
                  if (v) params.set(k, v); else params.delete(k);
                });
                router.replace(`${pathname}?${params.toString()}`);
              } catch (_) {}
            }}
          />
        )}
        <main style={{ flex: 1, padding: isAuthPage ? '0' : '20px' }}>
          {React.isValidElement(children) ? React.cloneElement(children, { filters }) : children}
        </main>
      </div>
    </InvoiceClickProvider>
  );
}
