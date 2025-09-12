'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import InvoiceDetailPageImpl from '../../src/ui-pages/InvoiceDetailPage.jsx';

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
        const { fetchInvoiceQueue } = await import('../../src/lib/fetchQueue');
        const queue = await fetchInvoiceQueue({ limit: 5000 });
        
        // Enhanced lookup: try multiple matching strategies
        const findInvoice = (searchTerm: string) => {
          console.log('🔍 Looking for invoice:', searchTerm);
          console.log('🔍 Available invoices:', queue.slice(0, 3).map(inv => ({
            invoice_number: inv.invoice_number,
            vendor: inv.vendor,
            hasId: !!inv.id
          })));
          
          // First try exact match on invoice_number
          let found = queue.find(inv => inv.invoice_number === searchTerm);
          if (found) {
            console.log('✅ Found by exact invoice_number match');
            return found;
          }
          
          // Try case-insensitive match on invoice_number
          found = queue.find(inv => 
            inv.invoice_number && 
            inv.invoice_number.toLowerCase() === searchTerm.toLowerCase()
          );
          if (found) {
            console.log('✅ Found by case-insensitive invoice_number match');
            return found;
          }
          
          // Try match by id only if it exists
          if (searchTerm) {
            found = queue.find(inv => inv.id === searchTerm);
            if (found) {
              console.log('✅ Found by id match');
              return found;
            }
          }
          
          // Try partial match on invoice_number (for cases with prefixes/suffixes)
          found = queue.find(inv => 
            inv.invoice_number && 
            (inv.invoice_number.includes(searchTerm) || searchTerm.includes(inv.invoice_number))
          );
          if (found) {
            console.log('✅ Found by partial invoice_number match');
            return found;
          }
          
          console.log('❌ No invoice found for:', searchTerm);
          return null;
        };
        
        const foundInvoice = findInvoice(invoiceNumber);
        
        if (foundInvoice) {
          console.log('✅ Invoice found:', {
            searchTerm: invoiceNumber,
            foundId: foundInvoice.id || 'none',
            foundInvoiceNumber: foundInvoice.invoice_number,
            vendor: foundInvoice.vendor || foundInvoice.vendor_name,
            total: foundInvoice.total || foundInvoice.invoice_total,
            office: foundInvoice.clinic_id || foundInvoice.office_location
          });
          
          // Transform the invoice data to match the expected format
          const transformedInvoice = {
            id: foundInvoice.id || foundInvoice.invoice_number, // fallback to invoice_number if no id
            invoice: foundInvoice.invoice_number || 'Unknown',
            invoice_number: foundInvoice.invoice_number,
            vendor: foundInvoice.vendor || foundInvoice.vendor_name || 'Unknown',
            amount: `$${foundInvoice.total || foundInvoice.invoice_total || '0.00'}`,
            office: foundInvoice.clinic_id || foundInvoice.office_location || 'Unknown',
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
          console.error('❌ Invoice not found:', {
            searchTerm: invoiceNumber,
            availableInvoices: queue.slice(0, 5).map(inv => ({
              id: inv.id || 'none',
              invoice_number: inv.invoice_number,
              vendor: inv.vendor || inv.vendor_name
            })),
            totalInvoices: queue.length
          });
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