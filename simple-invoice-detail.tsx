'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import InvoiceDetailPageImpl from '../../src/ui-pages/InvoiceDetailPage.jsx';

function InvoiceDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        const invoiceNumber = searchParams.get('invoice');
        if (!invoiceNumber) {
          setError('No invoice number provided');
          setLoading(false);
          return;
        }

        console.log('🔍 Loading invoice:', invoiceNumber);

        // Call API directly without the helper function
        const response = await fetch(`/api/invoice-queue?limit=5000`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.ok) {
          throw new Error(data.error || 'API returned error');
        }

        const queue = Array.isArray(data.invoices) ? data.invoices : [];
        console.log('🔍 API returned', queue.length, 'invoices');
        console.log('🔍 First 3 invoices:', queue.slice(0, 3).map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          vendor: inv.vendor_name || inv.vendor
        })));

        // Find the invoice
        let foundInvoice = null;

        // Try exact match first
        foundInvoice = queue.find(inv => inv.invoice_number === invoiceNumber);
        if (foundInvoice) {
          console.log('✅ Found by exact match:', foundInvoice.invoice_number);
        } else {
          // Try case-insensitive match
          foundInvoice = queue.find(inv => 
            inv.invoice_number && 
            inv.invoice_number.toLowerCase() === invoiceNumber.toLowerCase()
          );
          if (foundInvoice) {
            console.log('✅ Found by case-insensitive match:', foundInvoice.invoice_number);
          } else {
            // Try ID match
            foundInvoice = queue.find(inv => inv.id === invoiceNumber);
            if (foundInvoice) {
              console.log('✅ Found by ID match:', foundInvoice.id);
            }
          }
        }

        if (foundInvoice) {
          console.log('✅ Invoice found:', {
            id: foundInvoice.id,
            invoice_number: foundInvoice.invoice_number,
            vendor: foundInvoice.vendor_name || foundInvoice.vendor,
            total: foundInvoice.total || foundInvoice.invoice_total
          });

          // Transform the invoice data
          const transformedInvoice = {
            id: foundInvoice.id || foundInvoice.invoice_number,
            invoice: foundInvoice.invoice_number || 'Unknown',
            invoice_number: foundInvoice.invoice_number,
            vendor: foundInvoice.vendor_name || foundInvoice.vendor || 'Unknown',
            amount: `$${foundInvoice.total || foundInvoice.invoice_total || '0.00'}`,
            office: foundInvoice.office_location || foundInvoice.clinic_id || 'Unknown',
            dueDate: foundInvoice.due_date ? new Date(foundInvoice.due_date).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit'
            }) : 'N/A',
            invoiceDate: foundInvoice.invoice_date ? new Date(foundInvoice.invoice_date).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit'
            }) : 'N/A',
            category: foundInvoice.category || 'Other',
            invoice_date: foundInvoice.invoice_date,
            due_date: foundInvoice.due_date,
            json_path: foundInvoice.json_path,
            pdf_path: foundInvoice.pdf_path,
            timestamp: foundInvoice.timestamp,
            assigned_to: foundInvoice.assigned_to,
            approved: foundInvoice.approved,
            status: foundInvoice.status,
            total: foundInvoice.total || foundInvoice.invoice_total
          };
          
          setInvoice(transformedInvoice);
        } else {
          console.error('❌ Invoice not found for:', invoiceNumber);
          console.error('❌ Available invoice numbers:', queue.slice(0, 10).map(inv => inv.invoice_number));
          setError(`Invoice "${invoiceNumber}" not found`);
        }
      } catch (error) {
        console.error('❌ Error loading invoice:', error);
        setError(`Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadInvoice();
  }, [searchParams]);

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div>Loading invoice...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Error Loading Invoice</h2>
        <p>{error}</p>
        <button onClick={handleBack} style={{
          backgroundColor: '#4a90e2',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Go Back
        </button>
      </div>
    );
  }

  return <InvoiceDetailPageImpl invoice={invoice} onBack={handleBack} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>}>
      <InvoiceDetailContent />
    </Suspense>
  );
}
