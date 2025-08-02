import React, { useState } from 'react';

/**
 * Login page for existing users. Requires email and password. On
 * successful login the parent component is notified via the
 * onLogin prop. A link is provided to switch to the signup
 * screen via onSwitchMode.
 */
export default function LoginPage({ onLogin, onSwitchMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find((u) => u.email === email);
    if (!user || user.password !== password) {
      setError('Invalid email or password');
      return;
    }
    // Persist logged in user in session storage only
    sessionStorage.setItem('loggedInUser', JSON.stringify(user));
    if (onLogin) onLogin();
  }

  // Styles
  const containerStyle = { padding: '24px', maxWidth: '400px', margin: '0 auto' };
  const titleStyle = { fontSize: '24px', fontWeight: '600', color: '#357ab2', marginBottom: '16px' };
  const labelStyle = { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#4a5568' };
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
    width: '100%',
    padding: '10px',
    backgroundColor: '#357ab2',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  };
  const linkStyle = { color: '#357ab2', cursor: 'pointer', textDecoration: 'underline', marginTop: '8px' };
  const errorStyle = { color: '#e53e3e', marginBottom: '8px' };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Log In</h1>
      {error && <div style={errorStyle}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Email Address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          required
        />
        <label style={labelStyle}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
        />
        <button type="submit" style={buttonStyle}>Log In</button>
      </form>
      <div style={{ marginTop: '12px' }}>
        <span style={{ marginRight: '4px' }}>No account?</span>
        <span onClick={onSwitchMode} style={linkStyle}>Create one</span>
      </div>
    </div>
  );
}