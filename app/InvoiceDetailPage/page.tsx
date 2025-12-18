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

        // Get user email for API calls
        let userEmail = '';
        try {
          const stored = typeof window !== 'undefined' ? window.localStorage.getItem('loggedInUser') : null;
          if (stored) {
            const parsed = JSON.parse(stored);
            userEmail = parsed?.email || '';
          }
        } catch (e) {
          console.error('Failed to get user email:', e);
        }

        // First, try to load from the workflow store (which has the current status)
        let foundInvoice: any = null;
        try {
          const timestamp = new Date().getTime();
          const workflowResponse = await fetch(`/api/invoices/${encodeURIComponent(invoiceNumber)}?_t=${timestamp}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            }
          });
          if (workflowResponse.ok) {
            const workflowData = await workflowResponse.json();
            if (workflowData.ok && workflowData.invoice) {
              foundInvoice = workflowData.invoice;
              console.log('✅ Loaded invoice from workflow store:', foundInvoice?.invoice_number);
            }
          }
        } catch (e) {
          console.log('⚠️ Failed to load from workflow store, falling back to visible API:', e);
        }

        // If not found in workflow store, load from the visible API (same as list pages)
        if (!foundInvoice) {
          const timestamp = new Date().getTime();
          const visibleUrl = `/api/invoices/visible?limit=5000&email=${encodeURIComponent(userEmail)}&_t=${timestamp}`;
          const response = await fetch(visibleUrl, {
            cache: 'no-store',
            credentials: 'include',
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          if (!response.ok) {
            throw new Error('Failed to load visible invoices');
          }

          const data = await response.json();
          let allInvoices = data.invoices || [];

          // Find the invoice in the full list
          foundInvoice = allInvoices.find(inv => inv.invoice_number === invoiceNumber);
          if (!foundInvoice) {
            foundInvoice = allInvoices.find(inv => inv.id === invoiceNumber);
          }
        }

        // Load the invoice list for navigation purposes using the same endpoint as the list pages
        const timestamp = new Date().getTime();
        const visibleUrl = `/api/invoices/visible?limit=5000&email=${encodeURIComponent(userEmail)}&_t=${timestamp}`;
        const response = await fetch(visibleUrl, {
          cache: 'no-store',
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (!response.ok) {
          throw new Error('Failed to load visible invoices');
        }

        const data = await response.json();
        let allInvoices = data.invoices || [];

        // Parse filter parameters from the 'from' URL
        let filterParams: any = {};
        if (from) {
          try {
            const fromUrl = new URL(from, 'http://localhost');
            filterParams = {
              vendor: fromUrl.searchParams.get('vendor') || undefined,
              office: fromUrl.searchParams.get('office') || undefined,
              category: fromUrl.searchParams.get('category') || undefined,
              minAmount: fromUrl.searchParams.get('minAmount') || undefined,
              maxAmount: fromUrl.searchParams.get('maxAmount') || undefined,
              search: fromUrl.searchParams.get('search') || undefined,
              ach: fromUrl.searchParams.get('ach') || undefined,
            };
          } catch (e) {
            console.warn('Failed to parse filter parameters from URL:', e);
          }
        }

        // Now filter the queue based on which tab the user came from
        let queue = allInvoices;
        if (from) {
          if (from.includes('ToBePaid')) {
            // Only show invoices with status 'to_be_paid'
            queue = queue.filter(inv => (inv.status || '').toLowerCase() === 'to_be_paid');
          } else if (from.includes('ForMe')) {
            // Match the exact filter from ForMePage
            queue = queue.filter(inv => {
              if (inv.deleted || inv.workflow_deleted_at) return false;
              const status = (inv.status || '').toLowerCase();
              // Hide invoices that have already been paid, rejected, or removed
              if (status === 'paid' || status === 'rejected' || status === 'removed') return false;
              // Hide approved invoices
              if (inv.approved === true) return false;
              return true;
            });
          } else if (from.includes('Complete')) {
            // Only show invoices with status 'paid'
            queue = queue.filter(inv => (inv.status || '').toLowerCase() === 'paid');
          } else if (from.includes('AllInvoices')) {
            // Show all invoices (no filter)
          }
        }

        // Apply additional filters from the URL parameters
        if (filterParams.vendor) {
          queue = queue.filter(inv => {
            const invVendor = inv.vendor_name || inv.vendor || '';
            return invVendor === filterParams.vendor;
          });
        }
        if (filterParams.office) {
          queue = queue.filter(inv => {
            // Use office_id first (effective value from 3-layer system)
            const invOffice = inv.office_id || inv.office || inv.office_location || inv.clinic_id || '';
            return invOffice === filterParams.office;
          });
        }
        if (filterParams.category) {
          queue = queue.filter(inv => (inv.category || 'Other') === filterParams.category);
        }
        if (filterParams.minAmount) {
          const minAmount = parseFloat(filterParams.minAmount);
          queue = queue.filter(inv => {
            const amount = parseFloat(String(inv.invoice_total || inv.total || '0').replace(/[^0-9.]/g, '')) || 0;
            return amount >= minAmount;
          });
        }
        if (filterParams.maxAmount) {
          const maxAmount = parseFloat(filterParams.maxAmount);
          queue = queue.filter(inv => {
            const amount = parseFloat(String(inv.invoice_total || inv.total || '0').replace(/[^0-9.]/g, '')) || 0;
            return amount <= maxAmount;
          });
        }
        if (filterParams.search) {
          const searchLower = filterParams.search.toLowerCase();
          queue = queue.filter(inv => {
            const searchableText = [
              inv.invoice_number,
              inv.vendor_name || inv.vendor,
              // Use office_id first (effective value from 3-layer system)
              inv.office_id || inv.office || inv.office_location || inv.clinic_id,
              inv.category,
              String(inv.invoice_total || inv.total || '')
            ].join(' ').toLowerCase();
            return searchableText.includes(searchLower);
          });
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

          // Use office_id first (effective value from 3-layer system), then fallback to legacy fields
          const officeRaw = foundInvoice.office_id || foundInvoice.office || foundInvoice.office_location || foundInvoice.clinic_id || '';
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
            // Pass through the database 3-layer fields for proper state management
            office_id: foundInvoice.office_id,
            parsed_office_id: foundInvoice.parsed_office_id,
            corrected_office_id: foundInvoice.corrected_office_id,
            amount_cents: foundInvoice.amount_cents,
            parsed_amount_cents: foundInvoice.parsed_amount_cents,
            corrected_amount_cents: foundInvoice.corrected_amount_cents,
            parsed_vendor_name: foundInvoice.parsed_vendor_name,
            corrected_vendor_name: foundInvoice.corrected_vendor_name,
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
            line_items: Array.isArray(foundInvoice.line_items) ? foundInvoice.line_items : [],
            // Three-stage status tracking fields
            coded_at: foundInvoice.coded_at,
            coded_by_user_id: foundInvoice.coded_by_user_id,
            approved_at: foundInvoice.approved_at,
            approved_by_user_id: foundInvoice.approved_by_user_id,
            paid_at: foundInvoice.paid_at,
            paid_by_user_id: foundInvoice.paid_by_user_id,
            // Parsing status fields
            parsing_status: foundInvoice.parsing_status,
            parsing_error: foundInvoice.parsing_error,
            parse_attempts: foundInvoice.parse_attempts,
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
