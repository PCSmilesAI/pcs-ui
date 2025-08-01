
import { useState } from 'react';

const Button = ({ children, variant = 'default', ...props }) => {
  const base = 'px-4 py-2 rounded-full text-sm transition';
  const variants = {
    default: 'bg-primary text-white hover:bg-secondary',
    outline: 'border border-primary text-primary hover:bg-secondary hover:text-white',
    ghost: 'text-primary hover:text-white hover:bg-secondary',
    destructive: 'bg-red-500 text-white hover:bg-red-600'
  };
  return <button className={`${base} ${variants[variant] || ''}`} {...props}>{children}</button>;
};

export default function InvoiceDetail({ invoice, onBack }) {
  const [vendor, setVendor] = useState(invoice?.Vendor || '');
  const [office, setOffice] = useState(invoice?.Office || '');
  const [category, setCategory] = useState(invoice?.Category || '');
  const [lineItems, setLineItems] = useState(invoice?.LineItems || []);

  const handleRepair = () => {
    console.log('Repaired:', { vendor, office, category, lineItems });
  };

  return (
    <div className="p-6">
      <button onClick={onBack} className="text-[#357ab2] text-sm mb-4">← Back</button>

      <h3 className="text-xl font-semibold text-[#357ab2] mb-2">
        {invoice.Invoice} &nbsp; | &nbsp; {vendor} &nbsp; | &nbsp; ${invoice.Amount} &nbsp; | &nbsp; {office}
      </h3>

      <div className="flex gap-3 mb-4">
        <Button className="rounded-full px-6">Approve</Button>
        <Button className="rounded-full px-6" variant="destructive">Reject</Button>
        <Button className="rounded-full px-6" variant="outline" onClick={handleRepair}>Repair</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="font-semibold text-sm text-gray-600">Approval</p>
          <p className="text-gray-800">{invoice.Status || 'Pending'}</p>
        </div>
        <div>
          <p className="font-semibold text-sm text-gray-600">Payment</p>
          <p className="text-gray-800">${invoice.Amount} — {invoice.Status}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <input className="border p-2 rounded-md" value={invoice.Invoice} disabled />
        <input className="border p-2 rounded-md" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <input className="border p-2 rounded-md" value={office} onChange={(e) => setOffice(e.target.value)} />
        <input className="border p-2 rounded-md" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>

      <div className="mb-6">
        <h4 className="text-md font-semibold text-[#357ab2] mb-2">Line Items</h4>
        <div className="space-y-2">
          {lineItems.map((item, index) => (
            <div key={index} className="grid grid-cols-5 gap-2">
              <input className="border p-1 rounded" value={item.ID} readOnly />
              <input className="border p-1 rounded" value={item.Name} />
              <input className="border p-1 rounded" value={item.QTY} />
              <input className="border p-1 rounded" value={item['Unit Price']} />
              <input className="border p-1 rounded" value={item.Total} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h4 className="text-md font-semibold text-[#357ab2] mb-2">Invoice PDF</h4>
        <div className="border rounded-md p-4 bg-gray-50 text-center text-gray-500">
          PDF preview not available in this mock.
        </div>
        <Button className="mt-2">⬇ Download</Button>
      </div>
    </div>
  );
}
