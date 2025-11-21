#!/usr/bin/env python3
import subprocess
import sys
import os

os.chdir('/Users/BraxtonEllsworth/Desktop/pcs-ui')

try:
    # Add the file
    print("Adding file...")
    subprocess.run(['git', 'add', 'lib/invoices/reassignmentService.ts'], check=True)
    
    # Commit
    print("Committing...")
    subprocess.run([
        'git', 'commit', '-m',
        'fix: Correct reassignment targets extraction logic\n\n- Fix bug in getReassignmentTargets() where find() result was incorrectly indexed\n- find() returns a single element, not an array, so [0] was causing undefined\n- Now correctly extracts manager email from office_managers configuration'
    ], check=True)
    
    # Push
    print("Pushing to GitHub...")
    subprocess.run(['git', 'push', 'origin', 'main'], check=True)
    
    print("✅ Successfully deployed fix!")
    sys.exit(0)
    
except subprocess.CalledProcessError as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

