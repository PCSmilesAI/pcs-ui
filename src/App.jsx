
import { useState } from 'react';
import { Menu, X, UserCircle, Search, Filter } from 'lucide-react';
import InvoiceTable from './InvoiceTable';
import InvoiceDetail from './InvoiceDetail';
import VendorTable from './VendorTable';
import './index.css';

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

const TABS = ["For Me", "To Be Paid", "Complete", "Vendors", "All Invoices"];

const MOCK_DATA = [
  {
    Invoice: "IN761993",
    Vendor: "Artisan Dental",
    Amount: 1265.4,
    Office: "Roseburg",
    "Due Date": "2025-07-26",
    Category: "Dental Lab",
    Status: "To Be Paid",
    "Date Completed": "2025-08-09",
    LineItems: [
      { ID: "1185", Name: "Z360 Anterior", QTY: 3, "Unit Price": "$173.00", Total: "$519.00" },
      { ID: "3039", Name: "Flipper with Wire", QTY: 2, "Unit Price": "$238.00", Total: "$476.00" }
    ]
  },
  {
    Invoice: "4307",
    Vendor: "Exodus Dental",
    Amount: 1349.08,
    Office: "Lebanon",
    "Due Date": "2025-07-29",
    Category: "Dental Lab",
    Status: "Approval",
    "Date Completed": "2025-08-10",
    LineItems: [
      { ID: "8001", Name: "Crown Prep", QTY: 4, "Unit Price": "$200.00", Total: "$800.00" },
      { ID: "8002", Name: "X-Ray", QTY: 1, "Unit Price": "$549.08", Total: "$549.08" }
    ]
  }
];

const VENDORS = [
  { Name: "Artisan Dental", "Payment Method": "ACH", "Outstanding Amount": "$2,365.40", Contact: "123-456-7890" },
  { Name: "Exodus Dental", "Payment Method": "ACH", "Outstanding Amount": "$1,349.08", Contact: "987-654-3210" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("For Me");
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const filteredData = MOCK_DATA.filter(inv => {
    if (activeTab === "For Me") return true;
    if (activeTab === "To Be Paid") return inv.Status === "To Be Paid";
    if (activeTab === "Complete") return inv.Status === "Complete";
    if (activeTab === "All Invoices") return true;
    return false;
  });

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'outline'}
              onClick={() => {
                setActiveTab(tab);
                setSelectedInvoice(null);
              }}
            >
              {tab}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-3 relative">
          <Button variant="ghost" size="icon">
            <Search className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Filter className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAccountMenu((prev) => !prev)}
          >
            <UserCircle className="w-6 h-6" />
          </Button>

          {showAccountMenu && (
            <div className="absolute right-0 top-10 z-50 w-48 rounded-md border bg-white shadow-md">
              <ul className="text-sm text-gray-700">
                {['Account', 'Company Info', 'Payout Account', 'Reports'].map((item) => (
                  <li
                    key={item}
                    className="px-4 py-2 hover:bg-secondary hover:text-white cursor-pointer"
                    onClick={() => setShowAccountMenu(false)}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {selectedInvoice ? (
          <InvoiceDetail invoice={selectedInvoice} onBack={() => setSelectedInvoice(null)} />
        ) : (
          <>
            <h2 className="text-xl font-semibold text-primary mb-4">{activeTab}</h2>
            {activeTab === "Vendors" ? (
              <VendorTable data={VENDORS} />
            ) : (
              <InvoiceTable data={filteredData} onSelectInvoice={setSelectedInvoice} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
