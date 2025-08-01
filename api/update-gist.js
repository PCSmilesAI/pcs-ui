export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let users;
  try {
    const body = await req.json?.() || req.body;
    users = body.users;
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse body' });
  }

  if (!users || !Array.isArray(users)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const GIST_ID = '24025555424dd200727b06d461cffdc9';
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GIST_FILENAME = 'users.json';

  const updatedContent = JSON.stringify(users, null, 2);

  try {
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: updatedContent
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
