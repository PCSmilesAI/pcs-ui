'use client';
import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import NavBar from './NavBar';
import { InvoiceClickProvider } from '../context/InvoiceClickContext';

function AppLayoutContent({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState('');
  // QBO connection logic removed since QBO is already connected

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
    console.log('Toggle Filter clicked');
  };

  const handleSearch = (query) => {
    console.log('🔍 AppLayout: Search query received:', query);
    // Search is now handled by URL parameters, no need to manage state here
  };

  const handleLogout = () => {
    console.log('Logout clicked');
    router.push('/LoginPage');
  };

  // Handle invoice row clicks - navigate to invoice detail page
  const handleInvoiceRowClick = (invoice) => {
    console.log('🔍 AppLayout: Invoice clicked:', invoice);
    console.log('🔍 AppLayout: Invoice number:', invoice?.invoice_number);
    if (invoice?.invoice_number) {
      const url = `/InvoiceDetailPage?invoice=${encodeURIComponent(invoice.invoice_number)}`;
      console.log('🔍 AppLayout: Navigating to:', url);
      router.push(url);
    } else {
      console.warn('⚠️ AppLayout: No invoice_number found in clicked invoice');
    }
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
        <main style={{ flex: 1 }}>
          {children}
        </main>
      </div>
    </InvoiceClickProvider>
  );
}

export default function AppLayout({ children }) {
  return (
    <InvoiceClickProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </InvoiceClickProvider>
  );
}
