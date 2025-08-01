export default async function handler(req, res) {
  const { users } = req.body;

  if (!users || !Array.isArray(users)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const GIST_ID = '24025555424dd200727b06d461cffdc9';
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GIST_FILENAME = 'users.json';

  const updatedContent = JSON.stringify(users, null, 2);

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

  if (response.ok) {
    return res.status(200).json({ success: true, data });
  } else {
    return res.status(response.status).json({ success: false, error: data });
  }
}
