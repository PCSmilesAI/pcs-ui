const GIST_ID = '24025555424dd200727b06d461cffdc9';
const GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN_HERE'; // Replace this securely

const GIST_FILENAME = 'users.json';

const headers = {
  'Authorization': `token ${GITHUB_TOKEN}`,
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

// 💾 Save updated users list to Gist
async function saveUsers(users) {
  const updatedContent = JSON.stringify(users, null, 2);

  const body = {
    files: {
      [GIST_FILENAME]: {
        content: updatedContent
      }
    }
  };

  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body)
  });

  return res.ok;
}

// ➕ Signup function
async function signupUser(name, email, password) {
  const users = await getUsers();
  const exists = users.find(user => user.email === email);
  if (exists) return { success: false, message: 'Email already registered.' };

  users.push({ name, email, password });
  await saveUsers(users);
  return { success: true };
}

// 🔐 Login function
async function loginUser(email, password) {
  const users = await getUsers();
  const match = users.find(user => user.email === email && user.password === password);
  return match ? { success: true, user: match } : { success: false, message: 'Invalid credentials.' };
}

export { signupUser, loginUser, getUsers };
