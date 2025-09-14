'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState('');

  // keep input synced with back/forward and initial URL
  useEffect(() => {
    setValue(sp.get('search') ?? '');
  }, [sp]);

  // debounce URL updates when typing
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set('search', value);
      else next.delete('search');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(id);
  }, [value, pathname, sp, router]);

  return (
    <div style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search invoices, vendors, amounts..."
        style={{ 
          border: '1px solid #ccc', 
          borderRadius: '4px', 
          padding: '8px 12px', 
          width: '300px',
          fontSize: '14px'
        }}
        aria-label="Search"
      />
    </div>
  );
}