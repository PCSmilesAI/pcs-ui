import React, { useState } from 'react';
import NavBar from './components/NavBar.jsx';
import ForMePage from './pages/ForMePage.jsx';
import ToBePaidPage from './pages/ToBePaidPage.jsx';
import CompletePage from './pages/CompletePage.jsx';
import VendorsPage from './pages/VendorsPage.jsx';
import AllInvoicesPage from './pages/AllInvoicesPage.jsx';
import InvoiceDetailPage from './pages/InvoiceDetailPage.jsx';
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
  // Possible page identifiers: forMe, toBePaid, complete, vendors,
  // allInvoices, detail
  const [currentPage, setCurrentPage] = useState('forMe');
  const [previousPage, setPreviousPage] = useState('forMe');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  /**
   * Handle row click from tables. Stores the selected invoice and
   * switches to the detail page. The previous page is remembered
   * so the user can return to the correct list after viewing an
   * invoice.
   *
   * @param {Object} invoice - The invoice data associated with the row.
   */
  function handleRowClick(invoice) {
    setSelectedInvoice(invoice);
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation bar at the top of every page */}
      <NavBar
        currentPage={currentPage}
        onChangePage={(page) => setCurrentPage(page)}
        onToggleFilter={toggleFilter}
      />

      {/* Main content area. A max-width container keeps content
          centred on large displays while allowing it to grow on
          smaller screens. */}
      <div className="flex-1 relative overflow-hidden">
        {currentPage === 'forMe' && <ForMePage onRowClick={handleRowClick} />}
        {currentPage === 'toBePaid' && <ToBePaidPage onRowClick={handleRowClick} />}
        {currentPage === 'complete' && <CompletePage onRowClick={handleRowClick} />}
        {currentPage === 'vendors' && <VendorsPage />}
        {currentPage === 'allInvoices' && (
          <AllInvoicesPage
            onRowClick={handleRowClick}
            isFilterOpen={isFilterOpen}
          />
        )}
        {currentPage === 'detail' && selectedInvoice && (
          <InvoiceDetailPage invoice={selectedInvoice} onBack={handleBack} />
        )}

        {/* Filter panel overlay. Only rendered on the All Invoices
            page. It remains mounted while open to preserve
            internal state if needed. */}
        <FilterPanel
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
        />
      </div>
    </div>
  );
}