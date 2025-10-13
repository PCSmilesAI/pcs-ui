import React, { useEffect } from 'react';

/**
 * Lightweight toast component for inline notifications without altering layout.
 * The toast auto-dismisses after the provided duration but can also be closed
 * early by clicking on it.
 */
export default function Toast({ message, variant = 'info', duration = 4000, onDismiss }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      if (onDismiss) onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const palette = {
    info: {
      backgroundColor: '#eff6ff',
      borderColor: '#93c5fd',
      color: '#1d4ed8',
    },
    error: {
      backgroundColor: '#fee2e2',
      borderColor: '#f87171',
      color: '#b91c1c',
    },
    success: {
      backgroundColor: '#dcfce7',
      borderColor: '#86efac',
      color: '#166534',
    },
  };

  const style = {
    position: 'fixed',
    top: '24px',
    right: '24px',
    zIndex: 2000,
    minWidth: '240px',
    maxWidth: '360px',
    padding: '12px 16px',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.15)',
    border: `1px solid ${palette[variant]?.borderColor || palette.info.borderColor}`,
    backgroundColor: palette[variant]?.backgroundColor || palette.info.backgroundColor,
    color: palette[variant]?.color || palette.info.color,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  return (
    <div
      style={style}
      role="status"
      onClick={() => {
        if (onDismiss) onDismiss();
      }}
    >
      {message}
    </div>
  );
}
