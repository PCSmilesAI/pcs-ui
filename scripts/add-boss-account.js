#!/usr/bin/env node

/**
 * Add Boss Account Script
 * Adds mckaym@pacificcrestsmiles.com to the user database
 * 
 * Usage: node scripts/add-boss-account.js <password>
 * Example: node scripts/add-boss-account.js "SecurePassword123!"
 */

const https = require('https');
const bcrypt = require('bcrypt');

const GIST_ID = '24025555424dd200727b06d461cffdc9';
const GIST_FILENAME = 'users.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error('❌ Error: GITHUB_TOKEN environment variable not set');
  console.error('Please set GITHUB_TOKEN to your GitHub personal access token');
  process.exit(1);
}

const password = process.argv[2];
if (!password) {
  console.error('❌ Error: Password not provided');
  console.error('Usage: node scripts/add-boss-account.js <password>');
  process.exit(1);
}

// ============================================================================
// Fetch current users from Gist
// ============================================================================
async function fetchUsersFromGist() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/gists/${GIST_ID}`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'pcs-ui-admin',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const gist = JSON.parse(data);
          const fileContent = gist.files[GIST_FILENAME].content;
          const users = JSON.parse(fileContent);
          resolve(users);
        } catch (err) {
          reject(new Error(`Failed to parse Gist: ${err.message}`));
        }
      });
    }).on('error', reject).end();
  });
}

// ============================================================================
// Update Gist with new users
// ============================================================================
async function updateGist(users) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(users, null, 2),
        },
      },
    });

    const options = {
      hostname: 'api.github.com',
      path: `/gists/${GIST_ID}`,
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'pcs-ui-admin',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode}`));
        }
      });
    }).on('error', reject);

    req.write(body);
    req.end();
  });
}

// ============================================================================
// Main function
// ============================================================================
async function main() {
  try {
    console.log('🔐 Adding Boss Account to PCS System');
    console.log('====================================\n');

    // Fetch current users
    console.log('📥 Fetching current users from GitHub Gist...');
    const users = await fetchUsersFromGist();
    console.log(`✅ Found ${users.length} existing users\n`);

    // Check if boss account already exists
    const bossEmail = 'mckaym@pacificcrestsmiles.com';
    const existingBoss = users.find(u => u.email === bossEmail);
    
    if (existingBoss) {
      console.log(`⚠️  Boss account already exists: ${bossEmail}`);
      console.log('   Updating password...\n');
    } else {
      console.log(`✅ Boss account does not exist, creating new account\n`);
    }

    // Hash password
    console.log('🔒 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`✅ Password hashed (bcrypt rounds: 10)\n`);

    // Add or update boss account
    const bossAccount = {
      name: 'McKay',
      email: bossEmail,
      password: hashedPassword,
    };

    if (existingBoss) {
      // Update existing account
      const index = users.findIndex(u => u.email === bossEmail);
      users[index] = bossAccount;
      console.log('📝 Updated existing boss account');
    } else {
      // Add new account
      users.push(bossAccount);
      console.log('📝 Added new boss account');
    }

    // Update Gist
    console.log('📤 Updating GitHub Gist...');
    await updateGist(users);
    console.log(`✅ Successfully updated Gist\n`);

    // Verify
    console.log('✅ Boss Account Details:');
    console.log(`   - Email: ${bossAccount.email}`);
    console.log(`   - Name: ${bossAccount.name}`);
    console.log(`   - Password: ${password}`);
    console.log(`   - Hashed: ${hashedPassword.substring(0, 20)}...\n`);

    console.log('🎉 Boss account successfully added!');
    console.log('\n📋 Next Steps:');
    console.log('1. Boss can now login at: https://pcsmilesai.com/LoginPage');
    console.log(`2. Email: ${bossEmail}`);
    console.log(`3. Password: ${password}`);
    console.log('4. Boss will have admin privileges (already in ADMIN_EMAILS list)');
    console.log('\n⚠️  IMPORTANT: Share the password securely with the boss!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();

