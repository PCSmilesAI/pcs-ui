#!/usr/bin/env python3

import subprocess
import sys
import os

os.chdir('/Users/BraxtonEllsworth/Desktop/pcs-ui')

try:
    # Stage the file
    print("Staging file...")
    subprocess.run(['git', 'add', 'app/api/invoices/visible/route.ts'], check=True)
    
    # Commit
    print("Committing...")
    subprocess.run([
        'git', 'commit', 
        '-m', 'fix: Handle missing current_assigned_user_email column gracefully'
    ], check=True)
    
    # Push
    print("Pushing...")
    subprocess.run(['git', 'push', 'origin', 'main'], check=True)
    
    print("✅ Success!")
    sys.exit(0)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

