
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signupUser } from '../utils/gist_user_store';

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
      console.log("📬 Signup result:", result);
      if (result.success) {
        localStorage.setItem('loggedInUser', JSON.stringify({ name, email }));
        navigate('/');
      } else {
        setError(result.message || 'Signup failed');
      }
    } catch (err) {
      console.error("🔥 Signup error:", err);
      setError('Unexpected error occurred.');
    }
  }

  return (
    <div className="signup-container" style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center' }}>Sign Up</h2>
      <form onSubmit={handleSubmit} className="signup-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        <input type="text" placeholder="Admin Code" value={adminCode} onChange={e => setAdminCode(e.target.value)} />
        {error && <p className="error" style={{ color: 'red', fontWeight: 'bold' }}>{error}</p>}
        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}
