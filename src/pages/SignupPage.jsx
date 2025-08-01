
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
    <div className="signup-form">
      <h2>Create Account</h2>
      <form onSubmit={handleSubmit}>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />

        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        <label>Admin Code</label>
        <input value={adminCode} onChange={(e) => setAdminCode(e.target.value)} />

        {error && <p className="error">{error}</p>}
        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}
