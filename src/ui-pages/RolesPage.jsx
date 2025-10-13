import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Toast from '../components/Toast.jsx';

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pacificcrestsmiles.com',
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
  const [adminsInput, setAdminsInput] = useState('');
  const [apInput, setApInput] = useState('');
  const [officeManagerInputs, setOfficeManagerInputs] = useState({});
  const [offices, setOffices] = useState([]);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('loggedInUser');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.email) {
          setCurrentUserEmail(String(parsed.email).toLowerCase());
        }
      }
    } catch (_) {
      // ignore storage errors
    }
  }, []);

  const isAdminUser = useMemo(() => ADMIN_EMAILS.has(currentUserEmail), [currentUserEmail]);

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const initialiseOfficeInputs = useCallback((rolesOffices = {}, companyOffices = []) => {
    const names = new Set([
      ...Object.keys(rolesOffices || {}),
      ...companyOffices.map((office) => office?.name || '').filter(Boolean),
    ]);
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
        fetch('/office_info.json', { cache: 'no-store' }),
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
      const roles = rolesPayload?.roles || {};

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
        officeList = await officesRes.json().catch(() => []);
        if (!Array.isArray(officeList)) {
          officeList = [];
        }
      }
      setOffices(officeList);
      initialiseOfficeInputs(roles.office_managers || {}, officeList);
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

      const rolesPayload = {
        admins: parseEmailList(adminsInput),
        ap_authorizers: parseEmailList(apInput),
        office_managers: Object.fromEntries(
          combinedOffices.map((office) => [
            office,
            parseEmailList(officeManagerInputs[office] || ''),
          ])
        ),
        threshold_usd: thresholdValue,
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

  const addOffice = () => {
    const name = window.prompt('Office name');
    if (!name) return;
    setOfficeManagerInputs((prev) => {
      if (prev[name]) return prev;
      return { ...prev, [name]: '' };
    });
  };

  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: 600, color: '#357ab2', marginBottom: '16px' };
  const sectionTitleStyle = { fontSize: '18px', fontWeight: 600, color: '#357ab2', marginBottom: '12px', marginTop: '24px' };
  const inputStyle = {
    width: '100%',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
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
    borderRadius: '12px',
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
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>Office Managers</h2>
          <button
            onClick={addOffice}
            style={{
              padding: '6px 12px',
              borderRadius: '9999px',
              border: '1px solid #357ab2',
              backgroundColor: '#357ab2',
              color: '#ffffff',
              fontSize: '13px',
              cursor: 'pointer',
            }}
            type="button"
          >
            Add Office
          </button>
        </div>
        <p style={{ color: '#4a5568', fontSize: '13px', marginBottom: '12px' }}>
          Provide one email per line. Leave blank for offices that do not require approvals.
        </p>
        {combinedOffices.length === 0 && (
          <div style={{ color: '#64748b' }}>No offices found.</div>
        )}
        {combinedOffices.map((office) => (
          <div key={office} style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor={`office-${office}`}>
              {office}
            </label>
            <textarea
              id={`office-${office}`}
              value={officeManagerInputs[office] || ''}
              onChange={(e) => handleOfficeInputChange(office, e.target.value)}
              style={textAreaStyle}
            />
          </div>
        ))}
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
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  backgroundColor: '#f8fafc',
                }}
              >
                <div style={{ fontWeight: 600, color: '#357ab2', marginBottom: '4px' }}>
                  {office.name || 'Unnamed Office'}
                </div>
                {office.address && (
                  <div style={{ color: '#475569', marginBottom: '4px' }}>{office.address}</div>
                )}
                {office.manager && (
                  <div style={{ color: '#1e293b', marginBottom: '4px' }}>
                    <strong>Manager:</strong> {office.manager}
                  </div>
                )}
                {office.email && (
                  <div style={{ color: '#0f172a' }}>
                    <strong>Email:</strong> {office.email}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
    </div>
  );
}
