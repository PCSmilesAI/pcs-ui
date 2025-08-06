#!/usr/bin/env python3
"""
Sync Public Script
Automatically copies invoice_queue.json, email_invoices/, output_jsons/, and converts office_info.xls to JSON.
"""

import os
import shutil
import time
import subprocess
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

def sync_output_jsons():
    """Copy output_jsons directory to public directory"""
    source = "output_jsons"
    destination = "public/output_jsons"
    
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
        print(f"❌ Error syncing output jsons: {e}")
        return False

def convert_office_info():
    """Convert smiles_office_info.xls to JSON format"""
    xls_file = "smiles_office_info.xls"
    
    if not os.path.exists(xls_file):
        print(f"❌ Office info file not found: {xls_file}")
        return False
    
    try:
        # Run the conversion script
        result = subprocess.run(['python3', 'convert_office_info.py'], 
                              capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print(f"✅ Converted {xls_file} to office_info.json")
            return True
        else:
            print(f"❌ Error converting office info: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ Error running office info conversion: {e}")
        return False

def run_invoice_categorizer():
    """Run the invoice categorizer to update categories"""
    try:
        # Run the categorizer script
        result = subprocess.run(['python3', 'invoice_categorizer.py'], 
                              capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            print(f"✅ Updated invoice categories")
            return True
        else:
            print(f"❌ Error running categorizer: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ Error running invoice categorizer: {e}")
        return False

def main():
    """Main function - continuously sync the files"""
    print("🔄 Starting Invoice Queue Sync Service")
    print("=" * 50)
    
    # Initial sync
    sync_invoice_queue()
    sync_email_invoices()
    sync_output_jsons()
    convert_office_info()
    run_invoice_categorizer()
    
    # Monitor for changes
    last_queue_modified = 0
    last_invoices_modified = 0
    last_jsons_modified = 0
    last_office_info_modified = 0
    
    while True:
        try:
            # Check invoice queue
            if os.path.exists("invoice_queue.json"):
                current_modified = os.path.getmtime("invoice_queue.json")
                if current_modified > last_queue_modified:
                    print(f"📝 Queue file modified at {datetime.now().strftime('%H:%M:%S')}")
                    sync_invoice_queue()
                    run_invoice_categorizer()  # Re-categorize when queue changes
                    last_queue_modified = current_modified
            
            # Check email_invoices directory
            if os.path.exists("email_invoices"):
                current_modified = os.path.getmtime("email_invoices")
                if current_modified > last_invoices_modified:
                    print(f"📄 Email invoices modified at {datetime.now().strftime('%H:%M:%S')}")
                    sync_email_invoices()
                    last_invoices_modified = current_modified
            
            # Check output_jsons directory
            if os.path.exists("output_jsons"):
                current_modified = os.path.getmtime("output_jsons")
                if current_modified > last_jsons_modified:
                    print(f"📋 Output JSONs modified at {datetime.now().strftime('%H:%M:%S')}")
                    sync_output_jsons()
                    last_jsons_modified = current_modified
            
            # Check office info file
            if os.path.exists("smiles_office_info.xls"):
                current_modified = os.path.getmtime("smiles_office_info.xls")
                if current_modified > last_office_info_modified:
                    print(f"🏢 Office info file modified at {datetime.now().strftime('%H:%M:%S')}")
                    convert_office_info()
                    last_office_info_modified = current_modified
            
            time.sleep(2)  # Check every 2 seconds
            
        except KeyboardInterrupt:
            print("\n🛑 Sync service stopped by user")
            break
        except Exception as e:
            print(f"❌ Error in sync loop: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main() 