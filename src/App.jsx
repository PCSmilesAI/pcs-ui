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
    // Root container uses inline styles instead of Tailwind. It fills the
    // viewport, sets a light gray background and arranges its children
    // vertically.
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#edf3f8',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top window bar with subtle grey tone and control dots. We use
          inline styles so that these colors show up even when no
          external CSS is processed. */}
      <div
        style={{
          backgroundColor: '#d7dee8',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '12px',
          borderBottom: '1px solid #c2cad6',
        }}
      >
        {/* Control dots */}
        <div
          style={{
            width: '10px',
            height: '10px',
            backgroundColor: '#b7beca',
            borderRadius: '50%',
            marginRight: '6px',
          }}
        ></div>
        <div
          style={{
            width: '10px',
            height: '10px',
            backgroundColor: '#b7beca',
            borderRadius: '50%',
            marginRight: '6px',
          }}
        ></div>
        <div
          style={{
            width: '10px',
            height: '10px',
            backgroundColor: '#b7beca',
            borderRadius: '50%',
          }}
        ></div>
      </div>

      {/* Main white panel that contains the navigation bar and page
          content. It has blue borders on the left, right and bottom
          to match the wireframes. */}
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
        {/* Navigation bar sits at the top of the panel */}
        <NavBar
          currentPage={currentPage}
          onChangePage={(page) => setCurrentPage(page)}
          onToggleFilter={toggleFilter}
        />

        {/* Content area separated from the nav by a top border. The
            border is drawn using inline style so it always appears. */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'auto',
            borderTop: '1px solid #357ab2',
          }}
        >
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

      {/* Filter panel overlay. Renders outside the panel so it covers
          everything. This component handles its own inline styles. */}
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
      />
    </div>
  );
}