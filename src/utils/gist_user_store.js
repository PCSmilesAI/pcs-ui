
import bcrypt from 'bcryptjs';

const GIST_ID = '24025555424dd200727b06d461cffdc9';
const GIST_FILENAME = 'users.json';

const headers = {
  'Accept': 'application/vnd.github.v3+json'
};

// 🧠 Pull users from the GitHub Gist
async function getUsers() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'GET',
    headers
  });

  const data = await res.json();
  const content = data.files[GIST_FILENAME].content;
  return JSON.parse(content);
}

// 💾 Save updated users list to Gist via serverless function
async function saveUsers(users) {
  try {
    const res = await fetch('/api/update-gist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users })
    });

    const result = await res.json();
    if (!res.ok) {
      console.error("Serverless save error:", result?.error || result);
      return false;
    }

    return true;
  } catch (err) {
    console.error("saveUsers() failed to reach API:", err);
    return false;
  }
}

// ➕ Signup function with password hashing
async function signupUser(name, email, password) {
  try {
    console.log('🔐 Attempting to signup user:', { name, email });
    
    const users = await getUsers();
    console.log('📋 Retrieved existing users:', users.length);
    
    const exists = users.find(user => user.email === email);
    if (exists) {
      console.log('❌ User already exists:', email);
      return { success: false, message: 'Email already registered.' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ name, email, password: hashedPassword });
    console.log('✅ User added to local array, attempting to save...');

    const ok = await saveUsers(users);
    if (ok) {
      console.log('🎉 User saved successfully');
      return { success: true };
    } else {
      console.error('❌ Failed to save user to database');
      return { 
        success: false, 
        message: 'Failed to save user. This may be due to network restrictions or rate limiting. Please try again or contact support if the problem persists.' 
      };
    }
  } catch (error) {
    console.error('🔥 Signup error:', error);
    
    // Handle specific error types
    if (error.message.includes('fetch')) {
      return { 
        success: false, 
        message: 'Network error. Please check your internet connection and try again.' 
      };
    }
    
    if (error.message.includes('rate limit')) {
      return { 
        success: false, 
        message: 'Too many requests. Please wait a moment and try again.' 
      };
    }
    
    return { 
      success: false, 
      message: 'An unexpected error occurred. Please try again or contact support.' 
    };
  }
}

// 🔐 Login function with password comparison
async function loginUser(email, password) {
  const users = await getUsers();
  const match = users.find(user => user.email === email);
  if (!match) return { success: false, message: 'Invalid credentials.' };

  const valid = await bcrypt.compare(password, match.password);
  return valid ? { success: true, user: match } : { success: false, message: 'Invalid credentials.' };
}

export { signupUser, loginUser, getUsers };
