'use client';
import React, { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';

const InvoiceClickContext = createContext();

export function InvoiceClickProvider({ children }) {
  const router = useRouter();

  const handleInvoiceRowClick = (invoice) => {
    console.log('🔍 InvoiceClickContext: Invoice clicked:', invoice);
    console.log('🔍 InvoiceClickContext: Invoice number:', invoice?.invoice_number);
    if (invoice?.invoice_number) {
      const url = `/InvoiceDetailPage?invoice=${encodeURIComponent(invoice.invoice_number)}`;
      console.log('🔍 InvoiceClickContext: Navigating to:', url);
      router.push(url);
    } else {
      console.warn('⚠️ InvoiceClickContext: No invoice_number found in clicked invoice');
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
    throw new Error('useInvoiceClick must be used within an InvoiceClickProvider');
  }
  return context;
}
