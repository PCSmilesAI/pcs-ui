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
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top window bar with subtle grey tone and control dots */}
      <div className="bg-gray-200 h-6 flex items-center pl-3 space-x-2 border-b border-gray-300">
        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
      </div>

      {/* White panel containing the nav and page content with blue borders */}
      <div className="flex-1 flex flex-col bg-white border-l border-r border-b border-blue-600 overflow-hidden">
        {/* Navigation bar sits at the top of the panel */}
        <NavBar
          currentPage={currentPage}
          onChangePage={(page) => setCurrentPage(page)}
          onToggleFilter={toggleFilter}
        />
        {/* Content area separated from the nav by a top border */}
        <div className="flex-1 relative overflow-auto border-t border-blue-600">
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
        </div>
      </div>

      {/* Filter panel overlay. Renders outside the panel so it covers everything */}
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
      />
    </div>
  );
}