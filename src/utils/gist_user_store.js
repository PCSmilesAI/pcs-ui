// This file wraps helper functions for interacting with a GitHub Gist
// containing user account information.  It is imported by the
// signup and login pages to persist accounts remotely via a
// serverless function.  No changes should be made here unless
// updating the Gist ID or filename.

const GIST_ID = '24025555424dd200727b06d461cffdc9';
const GIST_FILENAME = 'users.json';

const headers = {
  Accept: 'application/vnd.github.v3+json'
};

// Pull users from the GitHub Gist
async function getUsers() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'GET',
    headers
  });
  const data = await res.json();
  const content = data.files[GIST_FILENAME].content;
  return JSON.parse(content);
}

// Save updated users list to Gist via serverless function
async function saveUsers(users) {
  try {
    const res = await fetch('/api/update-gist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users })
    });

    let result;
    try {
      result = await res.json();
    } catch (jsonError) {
      console.error('Failed to parse response as JSON', jsonError);
      return false;
    }

    if (!res.ok) {
      console.error('Serverless save error:', result?.error || result);
      return false;
    }

    return true;
  } catch (err) {
    console.error('saveUsers() failed to reach API:', err);
    return false;
  }
}

// Create a new user account.  Returns { success: true } on
// success, or { success: false, message } on failure.
async function signupUser(name, email, password) {
  const users = await getUsers();
  const exists = users.find((user) => user.email === email);
  if (exists) return { success: false, message: 'Email already registered.' };
  users.push({ name, email, password });
  const ok = await saveUsers(users);
  return ok
    ? { success: true }
    : { success: false, message: 'Failed to save user.' };
}

// Validate login credentials.  Returns { success: true, user }
// on success or { success: false, message } on failure.
async function loginUser(email, password) {
  const users = await getUsers();
  const match = users.find(
    (user) => user.email === email && user.password === password
  );
  return match
    ? { success: true, user: match }
    : { success: false, message: 'Invalid credentials.' };
}

export { signupUser, loginUser, getUsers };