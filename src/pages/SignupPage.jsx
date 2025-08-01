
import React, { useState } from 'react';
import { signupUser } from '../utils/gist_user_store';
import { useNavigate } from 'react-router-dom';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState('');

  const REQUIRED_CODE = 'PCSAI-Access2025';
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (!name || !email || !password || !adminCode) {
      setError('Please fill out all fields');
      return;
    }

    if (adminCode !== REQUIRED_CODE) {
      setError('Invalid admin code');
      return;
    }

    try {
      const result = await signupUser(name, email, password);
      if (result.success) {
        localStorage.setItem('loggedInUser', JSON.stringify({ name, email }));
        navigate('/');
      } else {
        setError(result.message || 'Signup failed');
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('Unexpected error occurred');
    }
  }

  return (
    <div className="auth-form">
      <h2>Sign Up</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <input
          type="text"
          placeholder="Admin Code"
          value={adminCode}
          onChange={e => setAdminCode(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}
