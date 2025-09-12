'use client'

import dynamic from 'next/dynamic'

const ForMePage = dynamic(() => import('../../src/ui-pages/ForMePage'), {
  ssr: false,
  loading: () => <div>Loading...</div>
})

export default function Page() {
  return <ForMePage />
}
