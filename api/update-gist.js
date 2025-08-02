
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    const users = body.users;

    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'Invalid users payload' });
    }

    const GIST_ID = '24025555424dd200727b06d461cffdc9';
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GIST_FILENAME = 'users.json';

    console.log("🔐 GITHUB_TOKEN available:", !!GITHUB_TOKEN);
    console.log("📦 Payload to Gist:", users);

    const updatedContent = JSON.stringify(users, null, 2);

    let response;
    try {
      response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
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
    } catch (fetchErr) {
      console.error("🚨 fetch error:", fetchErr);
      return res.status(500).json({ error: 'Fetch failed', details: fetchErr.message });
    }

    const data = await response.json();
    console.log("📡 GitHub Gist API response:", data);

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("🔥 Full crash:", err);
    return res.status(500).json({ error: 'Unhandled error', details: err.message });
  }
}
