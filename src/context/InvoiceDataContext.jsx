import React, { createContext, useContext, useState } from 'react';

/**
 * Context for sharing invoice data across components.
 * This allows the FilterPanel to access the current list of invoices
 * and dynamically generate filter options.
 */
const InvoiceDataContext = createContext();

export function InvoiceDataProvider({ children }) {
  const [invoices, setInvoices] = useState([]);

  return (
    <InvoiceDataContext.Provider value={{ invoices, setInvoices }}>
      {children}
    </InvoiceDataContext.Provider>
  );
}

export function useInvoiceData() {
  const context = useContext(InvoiceDataContext);
  if (!context) {
    throw new Error('useInvoiceData must be used within InvoiceDataProvider');
  }
  return context;
}

