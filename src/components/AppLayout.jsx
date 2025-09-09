'use client';
import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import NavBar from './NavBar';
import { InvoiceClickProvider } from '../context/InvoiceClickContext';

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState('');
  const [qboConnected, setQboConnected] = useState(false);
  const [qboLoading, setQboLoading] = useState(true);

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

  // Check QuickBooks connection status
  useEffect(() => {
    const checkQboStatus = async () => {
      try {
        const response = await fetch('/api/qbo/status');
        const data = await response.json();
        setQboConnected(data.connected);
      } catch (error) {
        console.error('❌ Failed to check QuickBooks status:', error);
        setQboConnected(false);
      } finally {
        setQboLoading(false);
      }
    };
    
    checkQboStatus();
  }, []);

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
    console.log('Search query:', query);
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
        
        {/* QuickBooks Connection Banner */}
        {!isAuthPage && !qboLoading && !qboConnected && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                marginRight: '12px'
              }}></div>
              <div>
                <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#92400e' }}>
                  QuickBooks Not Connected
                </p>
                <p style={{ margin: '0', fontSize: '14px', color: '#a16207' }}>
                  Connect to QuickBooks to enable full functionality
                </p>
              </div>
            </div>
            <a
              href="/api/qbo/auth"
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Connect QuickBooks
            </a>
          </div>
        )}
        
        <main style={{ flex: 1, padding: isAuthPage ? '0' : '20px' }}>
          {children}
        </main>
      </div>
    </InvoiceClickProvider>
  );
}
