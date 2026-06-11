import React, { createContext, useContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('loggedInUser');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false); // Set loading to false after checking localStorage
  }, []);

  const login = (userData) => {
    localStorage.setItem('loggedInUser', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    localStorage.removeItem('loggedInUser');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
