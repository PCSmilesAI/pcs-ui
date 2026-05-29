/**
 * CreditCardReceiptsPage.jsx
 *
 * Credit Card Receipts module — replicates the receipt-agent Flask app's "Sage"
 * design (navy sidebar + topbar). This file is the shell + router; each nav item
 * renders a view component from ./receipts/*. AppLayout suppresses the shared
 * pcs-ui top nav on this route so the module owns its full-height chrome.
 *
 * Styling: ./CreditCardReceiptsPage.module.css (scoped via CSS Modules).
 */

'use client';
import React, { useCallback, useState } from 'react';
import styles from './CreditCardReceiptsPage.module.css';
import { currentEmail } from './receipts/shared';
import ExpensesView from './receipts/ExpensesView';
import TransactionsView from './receipts/TransactionsView';
import CardsView from './receipts/CardsView';
import ReportsView from './receipts/ReportsView';
import DashboardView from './receipts/DashboardView';
import TasksView from './receipts/TasksView';
import { IntegrationsView, SettingsView, AIAssistantView } from './receipts/MiscViews';

const NAV = [
  { key: 'tasks', icon: '📋', label: 'Tasks' },
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'expenses', icon: '🧾', label: 'Business Expenses' },
  { key: 'transactions', icon: '💳', label: 'Transactions' },
  { key: 'cards', icon: '🗂️', label: 'Manage Cards' },
  { key: 'reports', icon: '📑', label: 'Expense Reports' },
  { key: 'integrations', icon: '🔌', label: 'Integrations' },
  { key: 'ai', icon: '✨', label: 'AI Assistant' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function CreditCardReceiptsPage() {
  const [view, setView] = useState('expenses');
  const [toast, setToast] = useState(null);

  const email = currentEmail();
  const avatarInitial = (email ? email[0] : 'U').toUpperCase();

  const flash = useCallback((message, variant = 'info') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const goTo = useCallback((key) => setView(key), []);

  const activeNav = NAV.find((n) => n.key === view) || NAV[2];

  const renderView = () => {
    switch (view) {
      case 'tasks': return <TasksView flash={flash} goTo={goTo} />;
      case 'dashboard': return <DashboardView flash={flash} />;
      case 'expenses': return <ExpensesView flash={flash} />;
      case 'transactions': return <TransactionsView flash={flash} />;
      case 'cards': return <CardsView flash={flash} />;
      case 'reports': return <ReportsView flash={flash} />;
      case 'integrations': return <IntegrationsView flash={flash} />;
      case 'ai': return <AIAssistantView flash={flash} />;
      case 'settings': return <SettingsView />;
      default: return <ExpensesView flash={flash} />;
    }
  };

  return (
    <div className={styles.shell}>
      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>PC</div>
          <div className={styles.brand}>
            <div className={styles.brandName}>PC SMILES</div>
            <div className={styles.brandProduct}>Receipts</div>
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`${styles.navItem} ${view === item.key ? styles.navItemActive : ''}`}
              onClick={() => setView(item.key)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          Pacific Crest Smiles Dental, LLC
          <br />
          <span style={{ opacity: 0.6 }}>Receipts module</span>
        </div>
      </aside>

      {/* ─── Main ────────────────────────────────────────────── */}
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>{activeNav.label}</div>
          <div className={styles.headerRight}>
            <div className={styles.userMenu}>
              <div className={styles.userAvatar}>{avatarInitial}</div>
              <span className={styles.userName}>{email || 'Not signed in'}</span>
            </div>
          </div>
        </header>

        <main className={styles.content}>{renderView()}</main>
      </div>

      {toast && (
        <div
          className={`${styles.toast} ${
            toast.variant === 'success' ? styles.toastSuccess : toast.variant === 'error' ? styles.toastError : ''
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
