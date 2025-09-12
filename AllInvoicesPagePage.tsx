'use client'

import dynamic from 'next/dynamic'

const AllInvoicesPage = dynamic(() => import('../../src/ui-pages/AllInvoicesPage'), {
  ssr: false,
  loading: () => <div>Loading...</div>
})

export default function Page() {
  return <AllInvoicesPage />
}
