'use client';

import { useEffect, useState } from 'react';

interface AllocationSummary {
  clinic_id: string;
  clinic_name: string;
  amount_cents: number;
  amount_usd: number;
  gl_account_name: string;
}

interface AllocationDisplayProps {
  invoiceId: string;
  isMultiLocation?: boolean;
}

export function AllocationDisplay({ invoiceId, isMultiLocation }: AllocationDisplayProps) {
  const [allocations, setAllocations] = useState<AllocationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (isMultiLocation) {
      fetchAllocations();
    }
  }, [invoiceId, isMultiLocation]);

  async function fetchAllocations() {
    try {
      setLoading(true);
      const response = await fetch(`/api/invoices/${invoiceId}/allocations`);
      if (!response.ok) {
        throw new Error('Failed to fetch allocations');
      }
      const data = await response.json();
      setAllocations(data.summary || []);
      setValidation(data.validation);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching allocations:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!isMultiLocation) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">Loading allocations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (allocations.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">No allocations found</p>
      </div>
    );
  }

  const totalAmount = allocations.reduce((sum, a) => sum + a.amount_usd, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">Multi-Location Allocations</h3>
        </div>

        {validation && !validation.valid && (
          <div className="px-6 py-4 bg-yellow-50 border-b border-yellow-200">
            <p className="text-sm text-yellow-800">⚠️ {validation.error}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clinic Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  GL Account
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allocations.map((allocation) => (
                <tr key={allocation.clinic_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {allocation.clinic_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {allocation.gl_account_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                    ${allocation.amount_usd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={2} className="px-6 py-3 text-sm font-semibold text-gray-900">
                  Total
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  ${totalAmount.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-800">
          <strong>Multi-Location Invoice:</strong> This invoice has been split equally across all {allocations.length} clinic locations. It will route directly to McKay for approval.
        </p>
      </div>
    </div>
  );
}

