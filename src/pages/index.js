import Link from 'next/link';

const pages = [
  { path: '/LoginPage', label: 'Login' },
  { path: '/SignupPage', label: 'Sign Up' },
  { path: '/ForMePage', label: 'For Me' },
  { path: '/ToBePaidPage', label: 'To Be Paid' },
  { path: '/CompletePage', label: 'Completed' },
  { path: '/InvoiceDetailPage', label: 'Invoice Detail' },
  { path: '/AccountPage', label: 'Account' },
  { path: '/VendorsPage', label: 'Vendors' },
  { path: '/VendorDetailPage', label: 'Vendor Detail' },
  { path: '/ReportsPage', label: 'Reports' },
  { path: '/AllInvoicesPage', label: 'All Invoices' },
  { path: '/CompanyInfoPage', label: 'Company Info' },
  { path: '/PayoutAccountPage', label: 'Payout Account' },
];

export default function Home() {
  return (
    <div style={{ padding: 32 }}>
      <h1>PCS AI UI Pages</h1>
      <ul>
        {pages.map((page) => (
          <li key={page.path}>
            <Link href={page.path}>{page.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
