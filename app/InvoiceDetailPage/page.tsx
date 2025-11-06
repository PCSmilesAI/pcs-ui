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
  const [invoiceQueue, setInvoiceQueue] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        const invoiceNumber = searchParams.get('invoice');
        const from = searchParams.get('from');
        if (!invoiceNumber) {
          console.error('No invoice number provided');
          setLoading(false);
          return;
        }

        // First, try to load from the workflow store (which has the current status)
        let foundInvoice = null;
        try {
          const workflowResponse = await fetch(`/api/invoices/${encodeURIComponent(invoiceNumber)}`);
          if (workflowResponse.ok) {
            const workflowData = await workflowResponse.json();
            if (workflowData.ok && workflowData.invoice) {
              foundInvoice = workflowData.invoice;
              console.log('✅ Loaded invoice from workflow store:', foundInvoice.invoice_number);
            }
          }
        } catch (e) {
          console.log('⚠️ Failed to load from workflow store, falling back to queue:', e);
        }

        // If not found in workflow store, load from the invoice queue
        if (!foundInvoice) {
          const response = await fetch('/api/invoice-queue?limit=5000');
          if (!response.ok) {
            throw new Error('Failed to load invoice queue');
          }

          const data = await response.json();
          let allInvoices = data.invoices || [];

          // Find the invoice in the full list
          foundInvoice = allInvoices.find(inv => inv.invoice_number === invoiceNumber);
          if (!foundInvoice) {
            foundInvoice = allInvoices.find(inv => inv.id === invoiceNumber);
          }
        }

        // Load the invoice queue for navigation purposes
        const response = await fetch('/api/invoice-queue?limit=5000');
        if (!response.ok) {
          throw new Error('Failed to load invoice queue');
        }

        const data = await response.json();
        let allInvoices = data.invoices || [];

        // Now filter the queue based on which tab the user came from
        let queue = allInvoices;
        if (from) {
          if (from.includes('ToBePaid')) {
            // Only show invoices with status 'to_be_paid'
            queue = queue.filter(inv => (inv.status || '').toLowerCase() === 'to_be_paid');
          } else if (from.includes('ForMe')) {
            // Only show invoices that are NOT approved/paid/to_be_paid
            queue = queue.filter(inv => {
              const status = (inv.status || '').toLowerCase();
              return status !== 'approved' && status !== 'paid' && status !== 'to_be_paid' && !inv.deleted && !inv.workflow_deleted_at;
            });
          } else if (from.includes('Complete')) {
            // Only show invoices with status 'paid'
            queue = queue.filter(inv => (inv.status || '').toLowerCase() === 'paid');
          } else if (from.includes('AllInvoices')) {
            // Show all invoices (no filter)
          }
        }

        // Find the current index in the filtered queue
        let currentIndex = -1;
        if (foundInvoice) {
          currentIndex = queue.findIndex(inv =>
            (inv.invoice_number === invoiceNumber || inv.id === invoiceNumber)
          );
        }

        if (foundInvoice) {
          // Set the queue and current index for navigation
          setInvoiceQueue(queue);
          setCurrentIndex(currentIndex);
          
          const officeRaw = foundInvoice.office_location || foundInvoice.office || foundInvoice.clinic_id || '';
          // Transform the invoice data to match the expected format
          const rawTotal = foundInvoice.invoice_total || foundInvoice.total || '0.00';
          const transformedInvoice = {
            id: foundInvoice.id || foundInvoice.invoice_number,
            invoice: foundInvoice.invoice_number || 'Unknown',
            invoice_number: foundInvoice.invoice_number,
            vendor: foundInvoice.vendor_name || foundInvoice.vendor || 'Unknown',
            vendor_name: foundInvoice.vendor_name || foundInvoice.vendor || 'Unknown',
            amount: `$${rawTotal}`,
            office: officeRaw || 'Unknown',
            rawOffice: officeRaw,
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
            source_file: foundInvoice.source_file,
            timestamp: foundInvoice.timestamp,
            assigned_to: foundInvoice.assigned_to,
            approved: foundInvoice.approved,
            status: foundInvoice.status,
            total: rawTotal,
            approvals: foundInvoice.approvals || {},
            line_items: Array.isArray(foundInvoice.line_items) ? foundInvoice.line_items : []
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
    const from = searchParams.get('from');
    if (from) {
      // Always go back to originating list (explicit target)
      router.replace(from);
    } else {
      router.back();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevInvoice = invoiceQueue[currentIndex - 1];
      const identifier = prevInvoice.invoice_number || prevInvoice.id;
      const from = searchParams.get('from');
      // Replace current history entry and preserve the original list target
      router.replace(`/InvoiceDetailPage?invoice=${encodeURIComponent(identifier)}${from ? `&from=${encodeURIComponent(from)}` : ''}`);
    }
  };

  const handleNext = () => {
    if (currentIndex < invoiceQueue.length - 1) {
      const nextInvoice = invoiceQueue[currentIndex + 1];
      const identifier = nextInvoice.invoice_number || nextInvoice.id;
      const from = searchParams.get('from');
      // Replace current history entry and preserve the original list target
      router.replace(`/InvoiceDetailPage?invoice=${encodeURIComponent(identifier)}${from ? `&from=${encodeURIComponent(from)}` : ''}`);
    }
  };

  const handleInvoiceRejected = (rejectedInvoiceId: string) => {
    // Remove the rejected invoice from the queue
    const updatedQueue = invoiceQueue.filter(inv =>
      (inv.invoice_number !== rejectedInvoiceId && inv.id !== rejectedInvoiceId)
    );
    setInvoiceQueue(updatedQueue);

    // Update the current index if needed
    if (currentIndex >= updatedQueue.length) {
      setCurrentIndex(Math.max(0, updatedQueue.length - 1));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div>Loading invoice...</div>
      </div>
    );
  }

  return (
    <InvoiceDetailPageImpl
      invoice={invoice}
      onBack={handleBack}
      onPrevious={handlePrevious}
      onNext={handleNext}
      canGoPrevious={currentIndex > 0}
      canGoNext={currentIndex < invoiceQueue.length - 1}
      onInvoiceRejected={handleInvoiceRejected}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>}>
      <InvoiceDetailContent />
    </Suspense>
  );
}
