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
        if (!invoiceNumber) {
          console.error('No invoice number provided');
          setLoading(false);
          return;
        }

        // Load the invoice queue to find the specific invoice
        const response = await fetch('/api/invoice-queue?limit=5000');
        if (!response.ok) {
          throw new Error('Failed to load invoice queue');
        }
        
        const data = await response.json();
        const queue = data.invoices || [];
        
        // Try to find by invoice_number first, then by id
        let foundInvoice = queue.find(inv => inv.invoice_number === invoiceNumber);
        let currentIndex = -1;
        
        if (foundInvoice) {
          currentIndex = queue.findIndex(inv => inv.invoice_number === invoiceNumber);
        } else {
          foundInvoice = queue.find(inv => inv.id === invoiceNumber);
          if (foundInvoice) {
            currentIndex = queue.findIndex(inv => inv.id === invoiceNumber);
          }
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
