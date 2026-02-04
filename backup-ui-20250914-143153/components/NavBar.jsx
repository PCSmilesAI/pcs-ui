'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // show/hide search like the previous UI (revealed by magnifier)
  const [showSearch, setShowSearch] = useState(false);
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

  const barStyle = {
    height: '56px',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #e5e7eb',
    background: '#ffffff',
  };

  const brandStyle = { fontWeight: 600, color: '#1f2937', fontSize: '16px' };

  const iconButtonStyle = {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '6px',
  };

  return (
    <div style={barStyle}>
      <div style={brandStyle}>PCS</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {showSearch && (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search invoices, vendors, amounts..."
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '6px 10px',
              width: '260px',
              fontSize: '14px'
            }}
            aria-label="Search"
          />
        )}
        <button
          onClick={() => setShowSearch((s) => !s)}
          aria-label="Toggle search"
          title="Search"
          style={iconButtonStyle}
        >
          🔍
        </button>
      </div>
    </div>
  );
}