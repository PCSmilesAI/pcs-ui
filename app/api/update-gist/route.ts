import { NextRequest, NextResponse } from 'next/server';

const GIST_ID = '24025555424dd200727b06d461cffdc9';
const GIST_FILENAME = 'users.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const { users } = await request.json();

    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      );
    }

    // Update the Gist with new users data
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(users, null, 2)
          }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: `Failed to update Gist: ${response.status} ${response.statusText}`, details: errorData },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update Gist: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
