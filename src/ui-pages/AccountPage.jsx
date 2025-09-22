
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AccountPage() {
  const messageStyle = { color: '#357ab2', marginTop: '8px' };
  const authContext = useAuth();
  const { user, logout } = authContext || {};

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  // Guard clause for undefined user during static generation
  if (!user) {
    return (
      <div style={{ padding: '40px' }}>
        <h2 style={{ color: '#357ab2' }}>Account</h2>
        <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
          Please log in to view your account information.
        </div>
      </div>
    );
  }

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    if (!user?.email) {
      setMessage('User not logged in.');
      return;
    }

    try {
      const res = await fetch('/api/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, newPassword })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('Password updated successfully.');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage(data.message || 'Password update failed.');
      }
    } catch (err) {
      setMessage('Server error. Try again later.');
    }
  };

  return (
    <div style={{ padding: '40px' }}>
      <h2 style={{ color: '#357ab2' }}>Account</h2>
      <div style={{ marginBottom: '20px' }}>
        <div><strong>Name:</strong> {user?.name || 'N/A'}</div>
        <div><strong>Email:</strong> {user?.email || 'N/A'}</div>
        <div><strong>Access Level:</strong> Employee</div>
        {logout && (
          <button
            onClick={logout}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: '#e53e3e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Log Out
          </button>
        )}
      </div>

      <div>
        <h4 style={{ color: '#357ab2' }}>Change Password</h4>
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={{ padding: '8px', marginBottom: '10px', width: '100%' }}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{ padding: '8px', marginBottom: '10px', width: '100%' }}
        />
        <button
          onClick={handlePasswordChange}
          style={{ padding: '10px 20px', backgroundColor: '#357ab2', color: 'white', border: 'none', borderRadius: '6px' }}
        >
          Save Password
        </button>
        {message && <div style={messageStyle}>{message}</div>}
      </div>
    </div>
  );
}
