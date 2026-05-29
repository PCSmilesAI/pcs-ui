/**
 * Shared helpers + small UI atoms for the Credit Card Receipts module views.
 */
import React from 'react';
import styles from '../CreditCardReceiptsPage.module.css';

export { styles };

export function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtDate(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

// Forward the current query string (e.g. ?email=...) so API auth works without cookies.
export function apiUrl(pathname, extra = {}) {
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  Object.entries(extra).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') params.delete(k);
    else params.set(k, String(v));
  });
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ''}`;
}

export function currentEmail() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('email') || '';
}

export async function apiFetch(pathname, opts = {}) {
  const res = await fetch(apiUrl(pathname), { credentials: 'include', cache: 'no-store', ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

export function StatusBadge({ status }) {
  const cls =
    status === 'matched'
      ? styles.badgeMatched
      : status === 'disputed' || status === 'blocked' || status === 'failed'
      ? styles.badgeDisputed
      : status === 'approved' || status === 'closed'
      ? styles.badgeMatched
      : styles.badgeUnmatched;
  return <span className={`${styles.badge} ${cls}`}>{status || 'unmatched'}</span>;
}

export function SummaryTiles({ tiles }) {
  return (
    <div className={styles.summaryTiles}>
      {tiles.map((t) => (
        <div key={t.label} className={styles.summaryTile}>
          <div className={styles.tileLabel}>{t.label}</div>
          <div className={styles.tileValue}>{t.value}</div>
          {t.suffix ? <div className={styles.tileSuffix}>{t.suffix}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Backdrop({ children, onClose }) {
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, message }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <div className={styles.emptyTitle}>{title}</div>
      <div className={styles.emptyMessage}>{message}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <div className={styles.pageTitle}>{title}</div>
        {subtitle ? <div className={styles.pageSubtitle}>{subtitle}</div> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
    </div>
  );
}
