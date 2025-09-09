import { NextResponse } from 'next/server';

const GIST_ID = '24025555424dd200727b06d461cffdc9';
const GIST_FILENAME = 'users.json';

const headers = {
  'Accept': 'application/vnd.github.v3+json'
};

export async function GET() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'GET',
      headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch users: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const content = data.files[GIST_FILENAME].content;
    const users = JSON.parse(content);
    
    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users from Gist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
