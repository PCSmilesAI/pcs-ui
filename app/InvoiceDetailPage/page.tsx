'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import InvoiceDetailPageImpl from '../../src/ui-pages/InvoiceDetailPage.jsx';

export const dynamic = 'force-dynamic';

function InvoiceDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        const invoiceNumber = searchParams.get('invoice');
        if (!invoiceNumber) {
          console.error('No invoice number provided');
          setLoading(false);
          return;
        }

        // Load the invoice queue to find the specific invoice
        const response = await fetch('/invoice_queue.json');
        if (!response.ok) {
          throw new Error('Failed to load invoice queue');
        }
        
        const queue = await response.json();
        const foundInvoice = queue.find(inv => inv.invoice_number === invoiceNumber);
        
        if (foundInvoice) {
          // Transform the invoice data to match the expected format
          const transformedInvoice = {
            invoice: foundInvoice.invoice_number || 'Unknown',
            invoice_number: foundInvoice.invoice_number,
            vendor: foundInvoice.vendor || 'Unknown',
            amount: `$${foundInvoice.total || '0.00'}`,
            office: foundInvoice.clinic_id || 'Unknown',
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
            total: foundInvoice.total
          };
          setInvoice(transformedInvoice);
        } else {
          console.error('Invoice not found:', invoiceNumber);
        }
      } catch (error) {
        console.error('Error loading invoice:', error);
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

  return <InvoiceDetailPageImpl invoice={invoice} onBack={handleBack} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>}>
      <InvoiceDetailContent />
    </Suspense>
  );
}