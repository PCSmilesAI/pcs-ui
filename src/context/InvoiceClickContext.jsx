'use client';
import React, { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';

const InvoiceClickContext = createContext();

export function InvoiceClickProvider({ children }) {
  const router = useRouter();

  const handleInvoiceRowClick = (invoice) => {
    console.log('🔍 InvoiceClickContext: Invoice clicked:', invoice);
    
    // Use invoice_number if it's not empty, otherwise use ID
    const identifier = (invoice?.invoice_number && invoice.invoice_number.trim() !== '') ? invoice.invoice_number : invoice?.id;
    
    console.log('🔍 InvoiceClickContext: Using identifier:', {
      invoice_number: invoice?.invoice_number,
      id: invoice?.id,
      using: identifier
    });
    
    if (identifier) {
      const from = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '';
      const url = `/InvoiceDetailPage?invoice=${encodeURIComponent(identifier)}${from ? `&from=${encodeURIComponent(from)}` : ''}`;
      console.log('🔍 InvoiceClickContext: Navigating to:', url);
      router.push(url);
    } else {
      console.warn('⚠️ InvoiceClickContext: No invoice_number or id found in clicked invoice:', invoice);
    }
  };

  return (
    <InvoiceClickContext.Provider value={{ handleInvoiceRowClick }}>
      {children}
    </InvoiceClickContext.Provider>
  );
}

export function useInvoiceClick() {
  const context = useContext(InvoiceClickContext);
  if (!context) {
    // During SSR, context might not be available yet
    // Return a no-op function that will be replaced on client
    if (typeof window === 'undefined') {
      return { handleInvoiceRowClick: () => {} };
    }
    throw new Error('useInvoiceClick must be used within an InvoiceClickProvider');
  }
  return context;
}
