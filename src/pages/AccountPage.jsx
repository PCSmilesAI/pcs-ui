import React, { useState } from 'react';

/**
 * Account page for managing the current user's personal details. Displays
 * email address, access level and allows password changes. At this time
 * the form does not persist changes to any back end; it purely updates
 * local state to illustrate the UI.
 */
export default function AccountPage() {
  const [email] = useState('mckaym@pacificcrestsmiles.com');
  const [accessLevel] = useState('Admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  function handleChangePassword() {
    if (!newPassword) {
      setMessage('Please enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    setMessage('Password changed successfully (mock).');
    setNewPassword('');
    setConfirmPassword('');
  }

  // Styles
  const containerStyle = { padding: '24px' };
  const titleStyle = { fontSize: '24px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' };
  const labelStyle = { fontSize: '16px', fontWeight: '500', color: '#4a5568', marginBottom: '4px' };
  const infoStyle = { marginBottom: '16px', fontSize: '16px', color: '#1f1f1f' };
  const inputStyle = {
    width: '100%',
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '14px',
    marginBottom: '12px',
    boxSizing: 'border-box',
  };
  const buttonStyle = {
    padding: '10px 16px',
    backgroundColor: '#357ab2',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  };
  const messageStyle = { color: '#357ab2', marginTop: '8px' };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Account</h1>
      <div style={infoStyle}>
        <strong>Email:</strong> {email}
      </div>
      <div style={infoStyle}>
        <strong>Access Level:</strong> {accessLevel}
      </div>
      <div>
        <label style={labelStyle}>Change Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          style={inputStyle}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          style={inputStyle}
        />
        <button onClick={handleChangePassword} style={buttonStyle}>Save Password</button>
        {message && <div style={messageStyle}>{message}</div>}
      </div>
    </div>
  );
}