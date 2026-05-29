/**
 * Manage Cards view — Amex card roster with assigned / unassigned tabs and
 * assign-to-user. A card is any card_last4 seen in transactions or receipts.
 */
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { styles, apiUrl, apiFetch, SummaryTiles, EmptyState, PageHeader, Backdrop } from './shared';

export default function CardsView({ flash }) {
  const [cards, setCards] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('unassigned');
  const [assignFor, setAssignFor] = useState(null); // card row being assigned

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(apiUrl('/api/receipts/cards'));
      setCards(Array.isArray(data.cards) ? data.cards : []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unassign = async (card) => {
    if (typeof window !== 'undefined' && !window.confirm(`Unassign card •••• ${card.card_last4}?`)) return;
    try {
      await apiFetch(apiUrl(`/api/receipts/cards/${card.card_last4}`), { method: 'DELETE' });
      flash('Card unassigned', 'success');
      load();
    } catch (e) {
      flash(e.message, 'error');
    }
  };

  const visible = cards.filter((c) => (tab === 'assigned' ? c.assigned : !c.assigned));
  const tiles = [
    { label: 'Total cards', value: stats ? stats.total : '—' },
    { label: 'Assigned', value: stats ? stats.assigned : '—' },
    { label: 'Unassigned', value: stats ? stats.unassigned : '—' },
  ];

  return (
    <>
      <PageHeader title="Manage Cards" subtitle="Assign each corporate card to the team member who manages its receipts." />
      <SummaryTiles tiles={tiles} />

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <div className={styles.tableFilters}>
            {['unassigned', 'assigned'].map((k) => (
              <button key={k} onClick={() => setTab(k)}
                className={`${styles.btn} ${tab === k ? styles.btnPrimary : styles.btnGhost}`} style={{ padding: '5px 12px', fontSize: 12, textTransform: 'capitalize' }}>
                {k} ({k === 'assigned' ? stats?.assigned ?? 0 : stats?.unassigned ?? 0})
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className={styles.emptyState} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : loading ? (
          <div className={styles.emptyState}>Loading cards…</div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="🗂️"
            title={tab === 'assigned' ? 'No assigned cards' : 'No unassigned cards'}
            message={tab === 'assigned' ? 'Assign a card from the Unassigned tab.' : 'Cards appear here once they show up in imported transactions or receipts.'}
          />
        ) : (
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Card</th><th>Cardholder</th>{tab === 'assigned' && <th>Assignee</th>}
                <th className={styles.right}>Transactions</th><th className={styles.right}>Receipts</th><th />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.card_last4}>
                  <td style={{ fontWeight: 500 }}>•••• {c.card_last4}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{c.cardholder_name || '—'}</td>
                  {tab === 'assigned' && <td>{c.assignee_email}</td>}
                  <td className={styles.right}>{c.txn_count}</td>
                  <td className={styles.right}>{c.receipt_count}</td>
                  <td className={styles.right}>
                    {c.assigned ? (
                      <>
                        <button className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setAssignFor(c)}>Reassign</button>{' '}
                        <button className={`${styles.btn} ${styles.btnDanger}`} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => unassign(c)}>Unassign</button>
                      </>
                    ) : (
                      <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setAssignFor(c)}>Assign</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assignFor && (
        <AssignModal
          card={assignFor}
          onClose={() => setAssignFor(null)}
          onDone={() => { setAssignFor(null); load(); }}
          flash={flash}
        />
      )}
    </>
  );
}

function AssignModal({ card, onClose, onDone, flash }) {
  const [email, setEmail] = useState(card.assignee_email || '');
  const [name, setName] = useState(card.cardholder_name || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email.trim()) return flash('Assignee email is required', 'error');
    try {
      setSaving(true);
      await apiFetch(apiUrl('/api/receipts/cards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_last4: card.card_last4, assignee_email: email.trim(), cardholder_name: name.trim() }),
      });
      flash('Card assigned', 'success');
      onDone();
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Assign card •••• {card.card_last4}</div>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Assignee email *</label>
            <input className={styles.formInput} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@pcsmiles.com" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Cardholder name</label>
            <input className={styles.formInput} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Backdrop>
  );
}
