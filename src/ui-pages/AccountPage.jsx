import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ADMIN_EMAILS = new Set([
  'business@pcsmilesai.com',
  'mckaym@pcsmiles.com',
  'laurap@pcsmiles.com',
]);

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'success', 'error', 'info'
  const [saving, setSaving] = useState(false);

  // Load user from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('loggedInUser');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      }
    } catch (e) {
      console.error('Error reading user from localStorage:', e);
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('loggedInUser');
    // Clear the cookie too
    document.cookie = 'loggedInUser=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    router.push('/LoginPage');
  };

  const handlePasswordChange = async () => {
    setMessage('');
    
    if (!currentPassword) {
      setMessage('Please enter your current password.');
      setMessageType('error');
      return;
    }

    if (!newPassword) {
      setMessage('Please enter a new password.');
      setMessageType('error');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('New password must be at least 6 characters.');
      setMessageType('error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match.');
      setMessageType('error');
      return;
    }

    if (!user?.email) {
      setMessage('User not logged in.');
      setMessageType('error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: user.email, 
          currentPassword,
          newPassword 
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage('Password updated successfully!');
        setMessageType('success');
        setNewPassword('');
        setConfirmPassword('');
        setCurrentPassword('');
      } else {
        setMessage(data.message || data.error || 'Password update failed.');
        setMessageType('error');
      }
    } catch (err) {
      console.error('Password change error:', err);
      setMessage('Server error. Please try again later.');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#357ab2' }}>Account</h2>
        <div style={{ color: '#666', padding: '20px' }}>Loading...</div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#357ab2' }}>Account</h2>
        <div style={{ color: '#666', padding: '20px', marginBottom: '20px' }}>
          Please log in to view your account information.
        </div>
        <button
          onClick={() => router.push('/LoginPage')}
          style={{
            padding: '10px 24px',
            backgroundColor: '#357ab2',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Go to Login
        </button>
      </div>
    );
  }

  const userEmail = user.email?.toLowerCase() || '';
  const isAdmin = ADMIN_EMAILS.has(userEmail);
  const accessLevel = isAdmin ? 'Administrator' : (user.role || 'Employee');

  const containerStyle = {
    padding: '40px',
    maxWidth: '600px',
    margin: '0 auto'
  };

  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    marginBottom: '24px'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase'
  };

  const valueStyle = {
    fontSize: '16px',
    color: '#1f2937',
    marginBottom: '16px'
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '12px',
    fontSize: '14px',
    marginBottom: '16px',
    boxSizing: 'border-box'
  };

  const buttonStyle = {
    padding: '10px 20px',
    backgroundColor: '#357ab2',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    opacity: saving ? 0.7 : 1
  };

  const messageStyle = {
    padding: '12px',
    borderRadius: '12px',
    marginTop: '16px',
    fontSize: '14px',
    backgroundColor: messageType === 'success' ? '#d1fae5' : messageType === 'error' ? '#fee2e2' : '#e0f2fe',
    color: messageType === 'success' ? '#065f46' : messageType === 'error' ? '#991b1b' : '#1e40af',
    border: `1px solid ${messageType === 'success' ? '#34d399' : messageType === 'error' ? '#f87171' : '#60a5fa'}`
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#357ab2', marginBottom: '24px' }}>Account Settings</h2>
      
      {/* User Info Card */}
      <div style={cardStyle}>
        <h3 style={{ color: '#1f2937', marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>
          Profile Information
        </h3>
        
        <div>
          <span style={labelStyle}>Name</span>
          <div style={valueStyle}>{user.name || 'N/A'}</div>
        </div>
        
        <div>
          <span style={labelStyle}>Email</span>
          <div style={valueStyle}>{user.email || 'N/A'}</div>
        </div>
        
        <div>
          <span style={labelStyle}>Access Level</span>
          <div style={{ ...valueStyle, marginBottom: 0 }}>
            <span style={{
              display: 'inline-block',
              padding: '4px 12px',
              backgroundColor: isAdmin ? '#dbeafe' : '#f3f4f6',
              color: isAdmin ? '#1e40af' : '#4b5563',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: '500'
            }}>
              {accessLevel}
            </span>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div style={cardStyle}>
        <h3 style={{ color: '#1f2937', marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>
          Change Password
        </h3>
        
        <div>
          <label style={labelStyle}>Current Password</label>
          <input
            type="password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={inputStyle}
          />
        </div>
        
        <div>
          <label style={labelStyle}>New Password</label>
          <input
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
          />
        </div>
        
        <div>
          <label style={labelStyle}>Confirm New Password</label>
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />
        </div>
        
        <button
          onClick={handlePasswordChange}
          disabled={saving}
          style={buttonStyle}
        >
          {saving ? 'Saving...' : 'Update Password'}
        </button>
        
        {message && <div style={messageStyle}>{message}</div>}
      </div>

      {/* Logout Button */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={handleLogout}
          style={{
            padding: '10px 24px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
