import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Toast from '../components/Toast.jsx';

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
  'laurap@pcsmiles.com',
]);

function parseEmailList(value) {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function RolesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [thresholdInput, setThresholdInput] = useState('1000');
  const [testMode, setTestMode] = useState(false);
  const [adminsInput, setAdminsInput] = useState('');
  const [apInput, setApInput] = useState('');
  const [officeManagerInputs, setOfficeManagerInputs] = useState({});
  const [offices, setOffices] = useState([]);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('loggedInUser');
      console.log('[RolesPage] localStorage loggedInUser:', stored);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('[RolesPage] parsed user:', parsed);
        if (parsed?.email) {
          const email = String(parsed.email).toLowerCase();
          console.log('[RolesPage] setting currentUserEmail:', email);
          setCurrentUserEmail(email);
        }
      }
    } catch (err) {
      console.error('[RolesPage] storage error:', err);
    }
  }, []);

  const isAdminUser = useMemo(() => ADMIN_EMAILS.has(currentUserEmail), [currentUserEmail]);

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const initialiseOfficeInputs = useCallback((rolesOffices = {}) => {
    // Fixed offices: only include keys that already exist in roles.office_managers
    const names = Object.keys(rolesOffices || {});
    const prepared = {};
    names.forEach((name) => {
      if (!name) return;
      const list = Array.isArray(rolesOffices[name]) ? rolesOffices[name] : [];
      prepared[name] = list.join('\n');
    });
    setOfficeManagerInputs(prepared);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [rolesRes, configRes, officesRes] = await Promise.all([
        fetch('/api/workflow/roles', { cache: 'no-store' }),
        fetch('/api/workflow/config', { cache: 'no-store' }),
        fetch('/api/company/offices', { cache: 'no-store' }),
      ]);

      if (rolesRes.status === 403) {
        setError('You do not have access to view workflow roles.');
        return;
      }
      if (!rolesRes.ok) {
        const payload = await rolesRes.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load roles');
      }
      const rolesPayload = await rolesRes.json();
      // API returns roles directly, not wrapped in { roles: ... }
      const roles = rolesPayload?.roles || rolesPayload || {};

      if (configRes.status === 403) {
        setError('You do not have access to view workflow configuration.');
        return;
      }
      if (!configRes.ok) {
        const configPayload = await configRes.json().catch(() => ({}));
        throw new Error(configPayload?.error || 'Failed to load workflow configuration');
      }
      const configPayload = await configRes.json();
      const thresholdValue =
        typeof configPayload?.admin_threshold_usd === 'number'
          ? configPayload.admin_threshold_usd
          : roles.threshold_usd || 0;
      setThresholdInput(String(thresholdValue));
      setTestMode(Boolean(roles?.test_mode_route_all_to_admin));

      if (Array.isArray(roles.admins)) {
        setAdminsInput(roles.admins.join('\n'));
      } else {
        setAdminsInput('');
      }
      if (Array.isArray(roles.ap_authorizers)) {
        setApInput(roles.ap_authorizers.join('\n'));
      } else {
        setApInput('');
      }

      let officeList = [];
      if (officesRes.ok) {
        const payload = await officesRes.json().catch(() => ({}));
        officeList = Array.isArray(payload?.offices) ? payload.offices : [];
      }
      setOffices(officeList);
      initialiseOfficeInputs(roles.office_managers || {});
    } catch (err) {
      console.error('❌ RolesPage: load failed', err);
      setError(err?.message || 'Failed to load role configuration');
    } finally {
      setLoading(false);
    }
  }, [initialiseOfficeInputs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const combinedOffices = useMemo(() => {
    return Object.keys(officeManagerInputs)
      .sort((a, b) => a.localeCompare(b));
  }, [officeManagerInputs]);

  async function handleSave() {
    try {
      setSaving(true);
      setError('');

      const thresholdValue = Number.parseFloat(thresholdInput);
      if (!Number.isFinite(thresholdValue) || thresholdValue < 0) {
        setError('Threshold must be a positive number.');
        return;
      }

      // Normalise and dedupe emails
      const dedupe = (list) => Array.from(new Set(list.map((e) => e.toLowerCase())));

      const rolesPayload = {
        admins: dedupe(parseEmailList(adminsInput)),
        ap_authorizers: dedupe(parseEmailList(apInput)),
        office_managers: Object.fromEntries(
          combinedOffices.map((office) => [
            office,
            dedupe(parseEmailList(officeManagerInputs[office] || '')),
          ])
        ),
        threshold_usd: thresholdValue,
        test_mode_route_all_to_admin: Boolean(testMode),
      };

      const rolesResp = await fetch('/api/workflow/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rolesPayload),
      });

      if (rolesResp.status === 403) {
        throw new Error('Only admins can update workflow roles.');
      }
      if (!rolesResp.ok) {
        const failure = await rolesResp.json().catch(() => ({}));
        throw new Error(failure?.error || 'Failed to update workflow roles');
      }

      const configResp = await fetch('/api/workflow/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_threshold_usd: thresholdValue }),
      });
      if (!configResp.ok) {
        const failure = await configResp.json().catch(() => ({}));
        throw new Error(failure?.error || 'Failed to update workflow threshold');
      }

      // Persist updates to Company Offices (manager/email edits)
      const updatedOffices = offices.map((office) => ({
        name: office?.name || '',
        address: office?.address || '',
        manager: office?.manager || '',
        email: office?.email || '',
      }));
      const officesResp = await fetch('/api/company/offices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offices: updatedOffices }),
      });
      if (!officesResp.ok) {
        const failure = await officesResp.json().catch(() => ({}));
        throw new Error(failure?.error || 'Failed to update company offices');
      }

      showToast('Workflow roles updated.', 'success');
      await loadData();
    } catch (err) {
      console.error('❌ RolesPage: save failed', err);
      const message = err?.message || 'Failed to save changes';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleOfficeInputChange(office, value) {
    setOfficeManagerInputs((prev) => ({
      ...prev,
      [office]: value,
    }));
  }

  // No add/remove offices here; office names are managed in Company Info (fixed list)

  function handleOfficeFieldChange(index, key, value) {
    setOffices((prev) => prev.map((o, i) => (i === index ? { ...o, [key]: value } : o)));
  }

  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: 600, color: '#357ab2', marginBottom: '16px' };
  const sectionTitleStyle = { fontSize: '18px', fontWeight: 600, color: '#357ab2', marginBottom: '12px', marginTop: '24px' };
  const inputStyle = {
    width: '100%',
    border: '1px solid #cbd5e0',
    borderRadius: '12px',
    padding: '8px 12px',
    fontSize: '14px',
    boxSizing: 'border-box',
  };
  const textAreaStyle = {
    ...inputStyle,
    minHeight: '100px',
    resize: 'vertical',
    fontFamily: 'inherit',
  };
  const labelStyle = { fontWeight: 500, color: '#4a5568', marginBottom: '6px', display: 'block' };
  const cardStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    padding: '16px',
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)',
    marginBottom: '20px',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Workflow Roles</h1>
        <div style={{ color: '#4a5568' }}>Loading configuration…</div>
        <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Workflow Roles</h1>
        <div style={{ color: '#b91c1c', fontWeight: 500 }}>
          Only administrators can view this page.
        </div>
        <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Workflow Roles</h1>
      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '16px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Approval Threshold</h2>
        <label style={labelStyle} htmlFor="threshold">
          Admin review required at or above (USD)
        </label>
        <input
          id="threshold"
          type="number"
          min="0"
          value={thresholdInput}
          onChange={(e) => setThresholdInput(e.target.value)}
          style={inputStyle}
        />
        <div style={{ marginTop: '12px' }}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
            />
            Route all approvals directly to Admin (Test mode)
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Administrators</h2>
        <label style={labelStyle} htmlFor="admins">
          Admin email addresses (one per line)
        </label>
        <textarea
          id="admins"
          value={adminsInput}
          onChange={(e) => setAdminsInput(e.target.value)}
          style={textAreaStyle}
        />
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Accounts Payable Approvers</h2>
        <label style={labelStyle} htmlFor="ap-approvers">
          AP approver email addresses (one per line)
        </label>
        <textarea
          id="ap-approvers"
          value={apInput}
          onChange={(e) => setApInput(e.target.value)}
          style={textAreaStyle}
        />
      </div>

      <div style={cardStyle}>
        <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>Company Offices</h2>
        {offices.length === 0 ? (
          <div style={{ color: '#64748b' }}>No office information available.</div>
        ) : (
          <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
            {offices.map((office, index) => (
              <li
                key={`${office.name || 'office'}-${index}`}
                style={{
                  marginBottom: '16px',
                  fontSize: '16px',
                  color: '#1f1f1f',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  backgroundColor: '#f8fafc',
                }}
              >
                <div style={{ fontWeight: 600, color: '#357ab2', fontSize: '18px', marginBottom: '4px' }}>
                  {office.name || 'Unnamed Office'}
                </div>
                <div style={{ color: '#4a5568', marginBottom: '8px', lineHeight: '1.4' }}>
                  {office.address || ''}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Office Manager</label>
                    <input
                      style={inputStyle}
                      value={office.manager || ''}
                      onChange={(e) => handleOfficeFieldChange(index, 'manager', e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Email</label>
                    <input
                      style={inputStyle}
                      value={office.email || ''}
                      onChange={(e) => handleOfficeFieldChange(index, 'email', e.target.value)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 20px',
            borderRadius: '9999px',
            border: '1px solid #357ab2',
            backgroundColor: saving ? '#93c5fd' : '#357ab2',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '14px',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s ease',
          }}
          type="button"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
    </div>
  );
}
