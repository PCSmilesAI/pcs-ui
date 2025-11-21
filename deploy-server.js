#!/usr/bin/env node

const { execSync } = require('child_process');

function runCommand(cmd, description) {
  console.log(`\n${description}...`);
  try {
    const output = execSync(cmd, { 
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 180000
    });
    console.log(output);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

async function deploy() {
  console.log('=== Deploying fix to production server ===\n');
  
  const commands = [
    {
      cmd: 'ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=no root@159.65.181.148 "cd /var/www/pcs-ui && git pull origin main"',
      desc: '1. Pulling latest code'
    },
    {
      cmd: 'ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=no root@159.65.181.148 "cd /var/www/pcs-ui && npm run build"',
      desc: '2. Rebuilding'
    },
    {
      cmd: 'ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=no root@159.65.181.148 "pm2 restart pcs-ui"',
      desc: '3. Restarting PM2'
    }
  ];
  
  for (const { cmd, desc } of commands) {
    if (!runCommand(cmd, desc)) {
      process.exit(1);
    }
  }
  
  console.log('\n✅ Deployment complete!');
  process.exit(0);
}

deploy().catch(err => {
  console.error('❌ Deployment failed:', err);
  process.exit(1);
});

