
export default async function handler(req, res) {
  // Add CORS headers to allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

    // Check if we have a GitHub token
    if (!GITHUB_TOKEN) {
      console.error("❌ No GitHub token available");
      return res.status(500).json({ 
        error: 'GitHub token not configured',
        message: 'Unable to save user data. Please contact support.'
      });
    }

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
      return res.status(500).json({ 
        error: 'Network error',
        message: 'Unable to connect to user database. Please check your internet connection and try again.',
        details: fetchErr.message 
      });
    }

    const data = await response.json();
    console.log("📡 GitHub Gist API response:", data);

    if (!response.ok) {
      // Handle specific GitHub API errors
      if (response.status === 403) {
        return res.status(500).json({ 
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please wait a moment and try again.',
          details: data.message || 'GitHub API rate limit'
        });
      }
      
      if (response.status === 401) {
        return res.status(500).json({ 
          error: 'Authentication failed',
          message: 'User database access error. Please contact support.',
          details: data.message || 'GitHub API authentication failed'
        });
      }

      return res.status(response.status).json({ 
        error: 'GitHub API error',
        message: 'Unable to save user data. Please try again later.',
        details: data.message || `GitHub API error: ${response.status}`
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("🔥 Full crash:", err);
    return res.status(500).json({ 
      error: 'Server error',
      message: 'An unexpected error occurred. Please try again later.',
      details: err.message 
    });
  }
}
