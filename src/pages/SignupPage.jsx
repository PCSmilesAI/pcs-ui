import React, { useState } from 'react';

/**
 * Signup page for new users. Collects name, email, password and an
 * admin code. Validates the admin code before creating a new
 * account. Accounts are stored in localStorage as a JSON array
 * under the key `users`. The user is also persisted in
 * `loggedInUser` and the parent is notified on successful signup.
 */
export default function SignupPage({ onSignup, onSwitchMode }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState('');

  const REQUIRED_CODE = 'PCSAI-Access2025';

  async function handleSubmit(e) {
    e.preventDefault();
    // Basic validation
    if (!name || !email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (adminCode !== REQUIRED_CODE) {
      setError('Invalid admin code');
      return;
    }
    // Check if user already exists
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    if (users.some((u) => u.email === email)) {
      setError('A user with that email already exists');
      return;
    }
    // Fetch IP address for record. Fallback to 'unknown' on error.
    let ip = 'unknown';
    try {
      const resp = await fetch('https://api.ipify.org?format=json');
      const data = await resp.json();
      ip = data.ip;
    } catch (err) {
      // ignore errors
    }
    const newUser = { name, email, password, ip };
    const updatedUsers = [...users, newUser];
    localStorage.setItem('users', JSON.stringify(updatedUsers));
    localStorage.setItem('loggedInUser', JSON.stringify(newUser));
    if (onSignup) onSignup();
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
      <h1 style={titleStyle}>Create Account</h1>
      {error && <div style={errorStyle}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          required
        />
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
        <label style={labelStyle}>Admin Access Code</label>
        <input
          type="text"
          value={adminCode}
          onChange={(e) => setAdminCode(e.target.value)}
          style={inputStyle}
          required
        />
        <button type="submit" style={buttonStyle}>Sign Up</button>
      </form>
      <div style={{ marginTop: '12px' }}>
        <span style={{ marginRight: '4px' }}>Already have an account?</span>
        <span onClick={onSwitchMode} style={linkStyle}>Back to login</span>
      </div>
    </div>
  );
}