#!/usr/bin/env python3
"""
Sync Public Script
Automatically copies invoice_queue.json and email_invoices/ to public/ directory for frontend access.
"""

import os
import shutil
import time
from datetime import datetime

def sync_invoice_queue():
    """Copy invoice_queue.json to public directory"""
    source = "invoice_queue.json"
    destination = "public/invoice_queue.json"
    
    if not os.path.exists(source):
        print(f"❌ Source file not found: {source}")
        return False
    
    try:
        shutil.copy2(source, destination)
        print(f"✅ Synced {source} to {destination}")
        return True
    except Exception as e:
        print(f"❌ Error syncing invoice queue: {e}")
        return False

def sync_email_invoices():
    """Copy email_invoices directory to public directory"""
    source = "email_invoices"
    destination = "public/email_invoices"
    
    if not os.path.exists(source):
        print(f"❌ Source directory not found: {source}")
        return False
    
    try:
        # Remove existing destination directory if it exists
        if os.path.exists(destination):
            shutil.rmtree(destination)
        
        # Copy the entire directory
        shutil.copytree(source, destination)
        print(f"✅ Synced {source}/ to {destination}/")
        return True
    except Exception as e:
        print(f"❌ Error syncing email invoices: {e}")
        return False

def main():
    """Main function - continuously sync the files"""
    print("🔄 Starting Invoice Queue Sync Service")
    print("=" * 50)
    
    # Initial sync
    sync_invoice_queue()
    sync_email_invoices()
    
    # Monitor for changes
    last_queue_modified = 0
    last_invoices_modified = 0
    
    while True:
        try:
            # Check invoice queue
            if os.path.exists("invoice_queue.json"):
                current_modified = os.path.getmtime("invoice_queue.json")
                if current_modified > last_queue_modified:
                    print(f"📝 Queue file modified at {datetime.now().strftime('%H:%M:%S')}")
                    sync_invoice_queue()
                    last_queue_modified = current_modified
            
            # Check email_invoices directory
            if os.path.exists("email_invoices"):
                current_modified = os.path.getmtime("email_invoices")
                if current_modified > last_invoices_modified:
                    print(f"📄 Email invoices modified at {datetime.now().strftime('%H:%M:%S')}")
                    sync_email_invoices()
                    last_invoices_modified = current_modified
            
            time.sleep(2)  # Check every 2 seconds
            
        except KeyboardInterrupt:
            print("\n🛑 Sync service stopped by user")
            break
        except Exception as e:
            print(f"❌ Error in sync loop: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main() 