import React from 'react';

export default function AchBadge({ status }) {
  const s = (status || 'missing').toLowerCase();
  const style = {
    complete: { bg: '#def7ec', fg: '#03543f', text: 'ACH Complete' },
    pending: { bg: '#fef3c7', fg: '#92400e', text: 'ACH Pending' },
    missing: { bg: '#f3f4f6', fg: '#374151', text: 'ACH Missing' },
  }[s] || { bg: '#f3f4f6', fg: '#374151', text: 'ACH Missing' };
  return (
    <span style={{ backgroundColor: style.bg, color: style.fg, borderRadius: 9999, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
      {style.text}
    </span>
  );
}




