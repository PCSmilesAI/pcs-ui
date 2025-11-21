#!/usr/bin/env python3

import subprocess
import sys

def run_ssh_command(cmd):
    """Run a command on the remote server via SSH"""
    full_cmd = [
        'ssh',
        '-o', 'ConnectTimeout=30',
        '-o', 'StrictHostKeyChecking=no',
        'root@159.65.181.148',
        cmd
    ]
    print(f"Running: {cmd}")
    result = subprocess.run(full_cmd, capture_output=True, text=True, timeout=180)
    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)
    return result.returncode == 0

try:
    print("=== Deploying fix to production server ===\n")
    
    print("1. Pulling latest code...")
    if not run_ssh_command('cd /var/www/pcs-ui && git pull origin main'):
        print("❌ Git pull failed")
        sys.exit(1)
    
    print("\n2. Rebuilding...")
    if not run_ssh_command('cd /var/www/pcs-ui && npm run build'):
        print("❌ Build failed")
        sys.exit(1)
    
    print("\n3. Restarting PM2...")
    if not run_ssh_command('pm2 restart pcs-ui'):
        print("❌ PM2 restart failed")
        sys.exit(1)
    
    print("\n✅ Deployment complete!")
    sys.exit(0)
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

