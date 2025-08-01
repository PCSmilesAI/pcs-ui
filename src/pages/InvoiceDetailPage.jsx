import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * Detail view for a single invoice. Displays high level summary
 * information at the top along with actions (approve, reject,
 * repair). Below the summary the left column shows invoice
 * status, details and line items. The right column contains a
 * placeholder for the invoice PDF. A back arrow returns the user
 * to the previous list.
 *
 * Props:
 *  - invoice: object containing invoice data (invoice, vendor,
 *    amount, office, category)
 *  - onBack: function() invoked when the back arrow is clicked
 */
export default function InvoiceDetailPage({ invoice, onBack }) {
  // Line items used for every invoice. In a real application this
  // data would come from an API.
  const lineItems = [
    { id: '1185', name: 'Z360 Anterior', qty: 3, unit: '$173.00', total: '$519.00' },
    { id: '3039', name: 'Flipper with Wire 4-6 Teeth', qty: 2, unit: '$238.00', total: '$476.00' },
    { id: '3255', name: 'Strengthner Bar', qty: 1, unit: '$41.00', total: '$41.00' },
  ];

  return (
    <div className="px-6 py-4">
      {/* Header with back arrow and invoice summary */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="text-blue-600 hover:text-blue-700 focus:outline-none"
            aria-label="Back"
          >
          <i className="fas fa-arrow-left text-xl"></i>
          </button>
          <div className="flex items-baseline space-x-3 text-lg font-semibold text-primary">
            <span>{invoice.invoice}</span>
            <span>{invoice.vendor}</span>
            <span>{invoice.amount}</span>
            <span>{invoice.office}</span>
          </div>
        </div>
        {/* Placeholder for a download icon on the right side of header */}
        <button
          className="text-blue-600 hover:text-blue-700 focus:outline-none"
          aria-label="Download"
        >
          <i className="fas fa-download text-xl"></i>
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center space-x-4 mb-6">
        {['Approve', 'Reject', 'Repair'].map((action) => (
          <button
            key={action}
            className="px-4 py-2 rounded-full text-sm font-medium border border-blue-600 text-blue-600 hover:bg-blue-100 focus:outline-none"
          >
            {action}
          </button>
        ))}
      </div>

      {/* Main content: two columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-l border-blue-600">
        {/* Left column: spans two thirds of width on desktop */}
        <div className="md:col-span-2 border-r border-blue-600">
          {/* Invoice Status section */}
          <div className="border-b border-blue-600 p-4">
            <h2 className="text-lg font-semibold text-blue-600 mb-2">Invoice Status</h2>
            <table className="w-full text-sm border-t border-l border-blue-600">
              <tbody>
                <tr className="border-b border-blue-600">
                  <td className="px-3 py-2 border-r border-blue-600 font-medium text-gray-700">
                    Approval
                  </td>
                  <td className="px-3 py-2">McKay&nbsp;&nbsp;Mckaym@pacificcrestsmiles.com</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border-r border-blue-600 font-medium text-gray-700">
                    Payment
                  </td>
                  <td className="px-3 py-2">
                    {invoice.amount} — To Be Paid
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Invoice Details section */}
          <div className="border-b border-blue-600 p-4">
            <h2 className="text-lg font-semibold text-blue-600 mb-2">Invoice Details</h2>
            <table className="w-full text-sm border-t border-l border-blue-600">
              <tbody>
                <tr className="border-b border-blue-600">
                  <td className="px-3 py-2 border-r border-blue-600 font-medium text-gray-700">
                    Invoice #
                  </td>
                  <td className="px-3 py-2">{invoice.invoice}</td>
                </tr>
                <tr className="border-b border-blue-600">
                  <td className="px-3 py-2 border-r border-blue-600 font-medium text-gray-700">
                    Vendor
                  </td>
                  <td className="px-3 py-2">{invoice.vendor}</td>
                </tr>
                <tr className="border-b border-blue-600">
                  <td className="px-3 py-2 border-r border-blue-600 font-medium text-gray-700">
                    Office
                  </td>
                  <td className="px-3 py-2">{invoice.office}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border-r border-primary font-medium text-gray-700">
                    Category
                  </td>
                  <td className="px-3 py-2">{invoice.category || 'Dental Lab'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Line Items section */}
          <div className="p-4">
            <h2 className="text-lg font-semibold text-blue-600 mb-2">Line Items</h2>
            <table className="w-full text-sm border-t border-l border-blue-600">
              <thead className="bg-white">
                <tr>
                  <th className="px-3 py-2 border-r border-blue-600 font-medium text-gray-600">ID</th>
                  <th className="px-3 py-2 border-r border-blue-600 font-medium text-gray-600">Name</th>
                  <th className="px-3 py-2 border-r border-blue-600 font-medium text-gray-600 text-center">
                    QTY
                  </th>
                  <th className="px-3 py-2 border-r border-blue-600 font-medium text-gray-600 text-right">
                    Unit Price
                  </th>
                  <th className="px-3 py-2 border-r border-blue-600 font-medium text-gray-600 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-blue-600">
                    <td className="px-3 py-2 border-r border-blue-600">{item.id}</td>
                    <td className="px-3 py-2 border-r border-blue-600">{item.name}</td>
                    <td className="px-3 py-2 border-r border-blue-600 text-center">{item.qty}</td>
                    <td className="px-3 py-2 border-r border-blue-600 text-right">{item.unit}</td>
                    <td className="px-3 py-2 border-r border-blue-600 text-right">{item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Right column: PDF placeholder */}
        <div className="border-r border-primary flex flex-col p-4 justify-start items-center">
          <div className="w-full h-full border border-primary flex items-center justify-center">
            <span className="text-gray-400">Invoice PDF</span>
          </div>
        </div>
      </div>
    </div>
  );
}