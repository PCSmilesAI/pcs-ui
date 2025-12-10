/**
 * User authentication module - uses local database with Gist fallback
 * Accounts persist through server restarts and code updates
 */

// ➕ Signup function - creates user in local database (with Gist sync)
async function signupUser(name, email, password, adminCode) {
  try {
    console.log('📝 Attempting signup for:', email);
    
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, adminCode })
    });
    
    const result = await res.json();
    
    if (!res.ok || !result.success) {
      console.log('❌ Signup failed:', result.message);
      return { success: false, message: result.message || 'Failed to create account' };
    }
    
    console.log('✅ Signup successful for:', email);
    return { success: true, user: result.user };
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    if (error.message.includes('fetch')) {
      return {
        success: false,
        message: 'Network error. Please check your internet connection and try again.'
      };
    }
    return {
      success: false,
      message: error.message || 'An unexpected error occurred. Please try again or contact support.'
    };
  }
}

// 🔐 Login function - authenticates against local database (with Gist fallback)
async function loginUser(email, password) {
  try {
    console.log('🔐 Attempting login for:', email);
    
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const result = await res.json();
    
    if (!res.ok || !result.success) {
      console.log('❌ Login failed:', result.message);
      return { success: false, message: result.message || 'Invalid credentials.' };
    }
    
    console.log('✅ Login successful for:', email);
    return { success: true, user: result.user };
    
  } catch (error) {
    console.error('❌ Login error:', error);
    if (error.message.includes('fetch')) {
      return {
        success: false,
        message: 'Network error. Please check your internet connection and try again.'
      };
    }
    return {
      success: false,
      message: error.message || 'An unexpected error occurred. Please try again or contact support.'
    };
  }
}

// 🧠 Get users (for admin purposes - uses Gist API for backwards compatibility)
async function getUsers() {
  const res = await fetch('/api/gist-users', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch users: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

export { signupUser, loginUser, getUsers };
