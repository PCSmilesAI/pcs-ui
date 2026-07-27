'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * In-app notification bell for ingest reports (and future alert types).
 * Polls /api/notifications on mount, visibility change, and every 60s.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications?limit=30', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) {
        setUnreadCount(data.unread_count || 0);
        setItems(data.notifications || []);
      }
    } catch (_) {
      // ignore network blips
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  async function markRead(ids) {
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : { all: true }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) {
        setUnreadCount(data.unread_count || 0);
        setItems((prev) =>
          prev.map((n) =>
            !ids || ids.includes(n.id)
              ? { ...n, read_at: n.read_at || new Date().toISOString() }
              : n
          )
        );
      }
    } catch (_) {
      // ignore
    }
  }

  function handleOpenToggle() {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  }

  async function handleItemClick(item) {
    setExpandedId((prev) => (prev === item.id ? null : item.id));
    if (!item.read_at) {
      await markRead([item.id]);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginRight: 12 }}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={handleOpenToggle}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          padding: '4px 6px',
          color: '#357ab2',
          fontSize: 20,
        }}
      >
        <span className="fas fa-bell" />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: '#e74c3c',
              color: '#fff',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              lineHeight: '16px',
              padding: '0 4px',
              textAlign: 'center',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '120%',
            width: 380,
            maxHeight: 440,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #d0d7de',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              borderBottom: '1px solid #eee',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <span>Notifications {loading ? '…' : ''}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#357ab2',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 16, color: '#666', fontSize: 13 }}>
              No notifications yet. When you email invoices to PCS AI, a summary
              of what was added vs already in the system will appear here.
            </div>
          ) : (
            items.map((item) => {
              const unread = !item.read_at;
              const expanded = expandedId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    background: unread ? '#f0f7ff' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: unread ? 700 : 500, fontSize: 13 }}>
                      {item.title || 'Update'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
                      {item.created_at ? String(item.created_at).replace('T', ' ').slice(0, 16) : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: '#444',
                      whiteSpace: 'pre-wrap',
                      maxHeight: expanded ? 'none' : 54,
                      overflow: 'hidden',
                    }}
                  >
                    {item.body}
                  </div>
                  {!expanded && item.body && item.body.length > 120 && (
                    <div style={{ fontSize: 11, color: '#357ab2', marginTop: 2 }}>Show more</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
