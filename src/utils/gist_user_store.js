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
  if (!res.ok) {
    throw new Error(`Failed to fetch users: ${res.status} ${res.statusText}`);
  }
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
      throw new Error(result?.error || 'Unknown error when saving users');
    }
    return true;
  } catch (err) {
    throw new Error('Failed to save users: ' + (err.message || err));
  }
}

// ➕ Signup function with password hashing and race protection
async function signupUser(name, email, password, retry = false) {
  try {
    // Always fetch latest users BEFORE attempting to save (race protection)
    const users = await getUsers();

    // Check if the email already exists
    const exists = users.find(user => user.email === email);
    if (exists) {
      return { success: false, message: 'Email already registered.' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ name, email, password: hashedPassword });

    try {
      await saveUsers(users);
      return { success: true };
    } catch (saveError) {
      // If save fails, possibly due to race (another user added), retry ONCE
      if (!retry) {
        // Wait very briefly before retrying (to allow Gist to update)
        await new Promise(res => setTimeout(res, 500));
        return await signupUser(name, email, password, true); // retry once
      } else {
        return {
          success: false,
          message: 'Failed to save user. Another user may have signed up at the same time. Please try again.'
        };
      }
    }
  } catch (error) {
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
      message: error.message || 'An unexpected error occurred. Please try again or contact support.'
    };
  }
}

// 🔐 Login function with password comparison
async function loginUser(email, password) {
  try {
    const users = await getUsers();
    const match = users.find(user => user.email === email);
    if (!match) return { success: false, message: 'Invalid credentials.' };

    const valid = await bcrypt.compare(password, match.password);
    return valid
      ? { success: true, user: match }
      : { success: false, message: 'Invalid credentials.' };
  } catch (error) {
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
      message: error.message || 'An unexpected error occurred. Please try again or contact support.'
    };
  }
}

export { signupUser, loginUser, getUsers };
