#!/usr/bin/env python3
"""
Consolidate Invoice Script
Reads all individual JSON files from output_jsons/ and consolidates them into invoice_queue.json
"""

import os
import json
import glob
from datetime import datetime

def consolidate_invoices():
    """Consolidate all individual invoice JSON files into invoice_queue.json"""
    
    # Paths
    output_dir = "output_jsons"
    queue_file = os.path.join("pcs_ai_data", "invoice_queue.json")
    
    # Ensure pcs_ai_data directory exists
    os.makedirs("pcs_ai_data", exist_ok=True)
    
    # Get all JSON files from output_jsons
    json_files = glob.glob(os.path.join(output_dir, "*.json"))
    
    print(f"Found {len(json_files)} JSON files to process")
    
    consolidated_invoices = []
    processed_count = 0
    error_count = 0
    
    for json_file in json_files:
        try:
            with open(json_file, 'r') as f:
                invoice_data = json.load(f)
            
            # Skip files that don't have proper invoice structure
            if not isinstance(invoice_data, dict) or 'vendor' not in invoice_data:
                print(f"⏩ Skipping {json_file} - not a valid invoice")
                continue
            
            # Add metadata
            invoice_data['id'] = f"inv_{processed_count + 1}"
            invoice_data['status'] = 'pending'
            invoice_data['assigned_to'] = None
            invoice_data['created_at'] = datetime.now().isoformat()
            invoice_data['source_file'] = os.path.basename(json_file)
            
            # Try to map PDF file using multiple strategies
            json_filename = os.path.basename(json_file)
            pdf_path = None
            
            # Strategy 1: Direct filename match
            potential_pdf_names = [
                json_filename.replace('.json', '.pdf'),
                json_filename.replace('_parsed.json', '.pdf'),
                json_filename.replace('.json', '') + '.pdf'
            ]
            
            for pdf_name in potential_pdf_names:
                potential_path = os.path.join('email_invoices', pdf_name)
                if os.path.exists(potential_path):
                    pdf_path = potential_path
                    break
            
            # Strategy 2: If no direct match, search by invoice number in PDF filenames
            if not pdf_path and invoice_data.get('invoice_number'):
                invoice_num = invoice_data['invoice_number']
                pdf_files = glob.glob(os.path.join('email_invoices', '*.pdf'))
                for pdf_file in pdf_files:
                    pdf_basename = os.path.basename(pdf_file)
                    if invoice_num in pdf_basename:
                        pdf_path = pdf_file
                        print(f"📎 Found PDF by invoice number: {invoice_num} -> {pdf_basename}")
                        break
            
            # Strategy 3: If still no match, search by date pattern
            if not pdf_path and invoice_data.get('invoice_date'):
                try:
                    # Extract date components from invoice
                    date_str = invoice_data['invoice_date']
                    if '/' in date_str:  # Format like 07/16/25
                        month, day, year = date_str.split('/')
                        if len(year) == 2:
                            year = '20' + year
                        date_pattern = f"{year}{month.zfill(2)}{day.zfill(2)}"  # 20250716
                        
                        pdf_files = glob.glob(os.path.join('email_invoices', '*.pdf'))
                        for pdf_file in pdf_files:
                            pdf_basename = os.path.basename(pdf_file)
                            if date_pattern in pdf_basename:
                                pdf_path = pdf_file
                                print(f"📎 Found PDF by date pattern: {date_pattern} -> {pdf_basename}")
                                break
                except Exception as e:
                    # If date parsing fails, continue without PDF
                    pass
            
            # Strategy 4: Search by partial invoice number (last 4-6 digits)
            if not pdf_path and invoice_data.get('invoice_number'):
                invoice_num = invoice_data['invoice_number']
                if len(invoice_num) >= 4:
                    # Try last 4-6 digits
                    for suffix_len in [6, 5, 4]:
                        if len(invoice_num) >= suffix_len:
                            suffix = invoice_num[-suffix_len:]
                            pdf_files = glob.glob(os.path.join('email_invoices', '*.pdf'))
                            for pdf_file in pdf_files:
                                pdf_basename = os.path.basename(pdf_file)
                                if suffix in pdf_basename:
                                    pdf_path = pdf_file
                                    print(f"📎 Found PDF by partial invoice number: {suffix} -> {pdf_basename}")
                                    break
                            if pdf_path:
                                break
            
            # Strategy 5: Search by vendor + amount combination
            if not pdf_path and invoice_data.get('vendor_name') and invoice_data.get('invoice_total'):
                vendor = invoice_data['vendor_name'].lower()
                amount = str(invoice_data['invoice_total']).replace('.', '')
                pdf_files = glob.glob(os.path.join('email_invoices', '*.pdf'))
                for pdf_file in pdf_files:
                    pdf_basename = os.path.basename(pdf_file).lower()
                    # Check if vendor name appears in filename
                    vendor_keywords = ['henry', 'schein', 'patterson', 'epic', 'exodus', 'artisan', 'tc']
                    vendor_found = any(keyword in vendor.lower() and keyword in pdf_basename for keyword in vendor_keywords)
                    if vendor_found:
                        # Try to find amount or partial amount in filename
                        if len(amount) >= 3 and (amount in pdf_basename or amount[:-2] in pdf_basename):
                            pdf_path = pdf_file
                            print(f"📎 Found PDF by vendor + amount: {vendor} ${invoice_data['invoice_total']} -> {os.path.basename(pdf_file)}")
                            break
            
            # Ensure PDF path starts with / for web access
            if pdf_path:
                # Convert relative path to web-accessible path
                if pdf_path.startswith('email_invoices/'):
                    invoice_data['pdf_path'] = '/' + pdf_path
                elif pdf_path.startswith('./email_invoices/'):
                    invoice_data['pdf_path'] = pdf_path.replace('./email_invoices/', '/email_invoices/')
                else:
                    invoice_data['pdf_path'] = pdf_path
            else:
                invoice_data['pdf_path'] = None
            
            # Log PDF mapping results
            if pdf_path:
                print(f"✅ PDF Mapped: {os.path.basename(pdf_path)}")
            else:
                vendor = invoice_data.get('vendor_name', 'Unknown')
                invoice_num = invoice_data.get('invoice_number', 'Unknown')
                date = invoice_data.get('invoice_date', 'Unknown')
                print(f"⚠️  No PDF found - Vendor: {vendor}, Invoice: {invoice_num}, Date: {date}")
            
            consolidated_invoices.append(invoice_data)
            processed_count += 1
            
            print(f"✅ Processed: {invoice_data.get('vendor_name', 'Unknown')} - Invoice {invoice_data.get('invoice_number', 'N/A')}")
            
        except Exception as e:
            print(f"❌ Error processing {json_file}: {e}")
            error_count += 1
            continue
    
    # Save consolidated invoices
    with open(queue_file, 'w') as f:
        json.dump(consolidated_invoices, f, indent=2)
    
    print(f"\n🎉 Consolidation complete!")
    print(f"📊 Processed: {processed_count} invoices")
    print(f"❌ Errors: {error_count} files")
    print(f"💾 Saved to: {queue_file}")
    
    return processed_count

if __name__ == "__main__":
    consolidate_invoices()
