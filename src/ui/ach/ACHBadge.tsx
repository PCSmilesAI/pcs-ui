import React from 'react';

export type AchStatus = 'complete' | 'pending' | 'missing' | undefined;

type Props = { status: AchStatus };

export default function ACHBadge({ status }: Props) {
  const { bg, fg, label } = (() => {
    switch (status) {
      case 'complete':
        return { bg: '#dcfce7', fg: '#166534', label: 'ACH: Complete' };
      case 'pending':
        return { bg: '#fef3c7', fg: '#92400e', label: 'ACH: Pending' };
      case 'missing':
      default:
        return { bg: '#e5e7eb', fg: '#374151', label: 'ACH: Missing' };
    }
  })();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: bg,
        color: fg,
        border: '1px solid rgba(0,0,0,0.06)'
      }}
    >
      {label}
    </span>
  );
}




