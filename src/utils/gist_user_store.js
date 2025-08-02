
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
  const users = await getUsers();
  const exists = users.find(user => user.email === email);
  if (exists) return { success: false, message: 'Email already registered.' };

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ name, email, password: hashedPassword });

  const ok = await saveUsers(users);
  return ok ? { success: true } : { success: false, message: 'Failed to save user.' };
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
