import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Account page for managing the current user's personal details. Displays
 * email address, access level and allows password changes. At this time
 * the form does not persist changes to any back end; it purely updates
 * local state to illustrate the UI.
 */
export default function AccountPage() {
  // Read the logged in user from localStorage.  If none is found
  // default to an empty object.  We store only name and email.
  const [user, setUser] = useState(() => {
    try {
      const data = localStorage.getItem('loggedInUser');
      return data ? JSON.parse(data) : null;
    } catch (err) {
      return null;
    }
  });
  // Access level is not stored with the user so default to
  // "Employee" for now.  This could be extended in the future.
  const [accessLevel] = useState('Employee');
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

const { user: loggedInUser, logout } = useAuth();

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Account</h1>
      {user && (
        <div style={infoStyle}>
          <strong>Name:</strong> {user.name}
        <button onClick={logout} style={{ marginTop: "1rem" }}>Log Out</button>
    </div>
      )}
      <div style={infoStyle}>
        <strong>Email:</strong> {user?.email || 'Unknown'}
      <button onClick={logout} style={{ marginTop: "1rem" }}>Log Out</button>
    </div>
      <div style={infoStyle}>
        <strong>Access Level:</strong> {accessLevel}
      <button onClick={logout} style={{ marginTop: "1rem" }}>Log Out</button>
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
        {message && <div style={messageStyle}>{message}<button onClick={logout} style={{ marginTop: "1rem" }}>Log Out</button>
    </div>}
      <button onClick={logout} style={{ marginTop: "1rem" }}>Log Out</button>
    </div>
    <button onClick={logout} style={{ marginTop: "1rem" }}>Log Out</button>
    </div>
  );
}