import React from 'react';

/**
 * Sliding filter panel. When open this component covers the
 * viewport with a semi-transparent overlay and reveals a panel
 * anchored to the left hand side. The panel contains a series
 * of filter controls that mirror those in the provided wireframe.
 * At present the controls do not perform any filtering; they are
 * purely illustrative and can be wired up to state as needed.
 *
 * Props:
 *  - isOpen: boolean controlling visibility
 *  - onClose: function() called when the overlay is clicked
 */
export default function FilterPanel({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-40 flex" aria-modal="true" role="dialog">
      {/* Overlay to dim the rest of the interface */}
      <div
        className="flex-1 bg-black bg-opacity-30"
        onClick={onClose}
      />
      {/* Actual filter panel */}
      <aside className="w-80 max-w-sm bg-white border-l border-primary shadow-xl overflow-y-auto p-4">
        <h2 className="text-xl font-semibold text-primary mb-4">Filters</h2>
        <div className="space-y-4">
          {/* Vendor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor
            </label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary">
              <option value="">Choose options</option>
              <option>Artisan Dental</option>
              <option>Exodus Dental Solutions</option>
              <option>Henry Schein</option>
            </select>
          </div>
          {/* Min Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Amount
            </label>
            <input
              type="number"
              placeholder="$"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
            />
          </div>
          {/* Max Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Amount
            </label>
            <input
              type="number"
              placeholder="$"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
            />
          </div>
          {/* Office */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Office
            </label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary">
              <option value="">Choose options</option>
              <option>Roseburg</option>
              <option>Lebanon</option>
              <option>Eugene</option>
            </select>
          </div>
          {/* Due Date Start */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date Start
            </label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
            />
          </div>
          {/* Due Date End */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date End
            </label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
            />
          </div>
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary">
              <option value="">Choose options</option>
              <option>Dental Lab</option>
              <option>Dental Supplies</option>
            </select>
          </div>
        </div>
      </aside>
    </div>
  );
}