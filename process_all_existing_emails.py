#!/usr/bin/env python3
"""
Process All Existing Emails Script
Scans through all existing emails in the inbox and processes any invoice PDFs found.
This is useful for initial setup or when you want to process historical emails.
"""

import os
import sys
import imaplib
import email
import time
from email.header import decode_header
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
import subprocess
import json
from datetime import datetime
import re

# Configuration
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"
IMAP_PORT = 993
SAVE_DIR = "email_invoices"

def log(msg):
    """Custom logging function"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def create_directories():
    """Create necessary directories if they don't exist"""
    os.makedirs(SAVE_DIR, exist_ok=True)
    os.makedirs("output_jsons", exist_ok=True)
    os.makedirs("processed_invoices", exist_ok=True)

def detect_vendor_from_email(msg):
    """Detect vendor from email content"""
    try:
        # Get email subject
        subject = ""
        if msg['subject']:
            subject = decode_header(msg['subject'])[0][0]
            if isinstance(subject, bytes):
                subject = subject.decode('utf-8', errors='ignore')
        
        # Get email body
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                    break
        else:
            body = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        
        # Get sender
        sender = msg.get('from', '')
        
        # Combine all text for vendor detection
        all_text = f"{subject} {body} {sender}".lower()
        
        # Vendor detection logic
        if 'epic' in all_text:
            return 'epic'
        elif 'patterson' in all_text:
            return 'patterson'
        elif 'henry' in all_text:
            return 'henry'
        elif 'artisan' in all_text:
            return 'artisan'
        elif 'tc' in all_text or 't.c.' in all_text:
            return 'tc'
        else:
            return None
            
    except Exception as e:
        log(f"❌ Error detecting vendor from email: {e}")
        return None

def run_vendor_router(filepath, detected_vendor=None):
    """Run the vendor router to process the PDF and generate JSON output"""
    try:
        # First, run vendor router to detect vendor
        cmd = ['python3', 'vendor_router.py', filepath]
        if detected_vendor:
            cmd.append(detected_vendor)
        
        log(f"🔄 Running vendor router: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            vendor = result.stdout.strip()
            log(f"✅ Vendor detected: {vendor}")
            
            # Now run the actual parser to generate JSON
            if vendor and vendor != "unknown":
                parser_file = get_parser_file(vendor)
                if parser_file:
                    log(f"🔧 Running {vendor} parser: {parser_file}")
                    parser_result = subprocess.run(
                        ['python3', parser_file, filepath],
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    
                    if parser_result.returncode == 0:
                        log(f"✅ {vendor} parser completed successfully")
                        if "Extracted" in parser_result.stdout:
                            log(f"📊 JSON generated for {vendor} invoice")
                        else:
                            log(f"⚠️ Parser ran but may not have extracted data")
                        return True
                    else:
                        log(f"❌ {vendor} parser failed: {parser_result.stderr}")
                        return False
                else:
                    log(f"❌ No parser found for vendor: {vendor}")
                    return False
            else:
                log(f"❓ Unknown vendor, skipping parsing")
                return False
        else:
            log(f"❌ Vendor router failed: {result.stderr}")
            return False
        
    except subprocess.TimeoutExpired:
        log(f"⏰ Vendor router timed out")
        return False
    except Exception as e:
        log(f"❌ Error running vendor router: {e}")
        return False

def get_parser_file(vendor):
    """Get the parser file for a given vendor"""
    parser_mapping = {
        'epic': 'epic_parser.py',
        'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
        'henry': 'henry_parser.py',
        'exodus': 'exodus_parser.py',
        'artisan': 'parse_artisan_dental_exporting_fixed.py',
        'tc': 'parse_tc_dental_invoice.py'
    }
    
    parser_file = parser_mapping.get(vendor)
    if parser_file and os.path.exists(parser_file):
        return parser_file
    return None

def process_attachments(msg, email_id):
    """Process email attachments"""
    try:
        if not msg.is_multipart():
            return 0
        
        processed_count = 0
        
        for part in msg.walk():
            if part.get_content_maintype() == 'multipart':
                continue
                
            if part.get('Content-Disposition') is None:
                continue
                
            filename = part.get_filename()
            if not filename:
                continue
                
            # Decode filename if needed
            if decode_header(filename)[0][1] is not None:
                filename = decode_header(filename)[0][0].decode(decode_header(filename)[0][1])
            
            # Check if it's a PDF
            if not filename.lower().endswith('.pdf'):
                continue
                
            log(f"📎 Found PDF attachment: {filename}")
            
            # Create unique filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = re.sub(r'[^\w\-_\.]', '_', filename)
            unique_filename = f"email_{email_id}_{timestamp}_{safe_filename}"
            filepath = os.path.join(SAVE_DIR, unique_filename)
            
            # Save the PDF
            with open(filepath, 'wb') as f:
                f.write(part.get_payload(decode=True))
            
            log(f"💾 Saved PDF to: {filepath}")
            
            # Detect vendor from email
            detected_vendor = detect_vendor_from_email(msg)
            if detected_vendor:
                log(f"🏷️ Detected vendor: {detected_vendor}")
            else:
                log(f"❓ No vendor detected, will auto-detect from PDF")
            
            # Run vendor router
            if run_vendor_router(filepath, detected_vendor):
                processed_count += 1
                log(f"✅ Successfully processed: {filename}")
                
                # Note: Invoice queue writer runs as background service
                # New JSON files will be automatically detected and added to queue
            else:
                log(f"❌ Failed to process: {filename}")
        
        return processed_count
        
    except Exception as e:
        log(f"❌ Error processing attachments: {e}")
        return 0

def process_all_emails():
    """Process all existing emails in the inbox"""
    try:
        log("🚀 Starting to process all existing emails...")
        
        # Create directories
        create_directories()
        
        # Connect to IMAP server
        log(f"📧 Connecting to {IMAP_SERVER}...")
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_USER, EMAIL_PASS)
        log("✅ Connected to email server")
        
        # Select inbox
        mail.select('INBOX')
        
        # Search for all emails
        log("🔍 Searching for all emails...")
        status, messages = mail.search(None, 'ALL')
        
        if status != 'OK':
            log("❌ Failed to search emails")
            return
        
        email_ids = messages[0].split()
        total_emails = len(email_ids)
        log(f"📊 Found {total_emails} emails to process")
        
        if total_emails == 0:
            log("📭 No emails found in inbox")
            return
        
        processed_emails = 0
        processed_pdfs = 0
        
        # Process emails from newest to oldest
        for i, email_id in enumerate(reversed(email_ids), 1):
            try:
                log(f"📧 Processing email {i}/{total_emails} (ID: {email_id.decode()})")
                
                # Fetch email
                status, msg_data = mail.fetch(email_id, '(RFC822)')
                if status != 'OK':
                    log(f"❌ Failed to fetch email {email_id}")
                    continue
                
                # Parse email
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)
                
                # Get email subject for logging
                subject = ""
                if msg['subject']:
                    subject = decode_header(msg['subject'])[0][0]
                    if isinstance(subject, bytes):
                        subject = subject.decode('utf-8', errors='ignore')
                
                log(f"📋 Subject: {subject[:100]}...")
                
                # Process attachments
                pdf_count = process_attachments(msg, email_id.decode())
                if pdf_count > 0:
                    processed_emails += 1
                    processed_pdfs += pdf_count
                    log(f"✅ Email processed: {pdf_count} PDF(s) found")
                else:
                    log(f"ℹ️ No PDFs found in this email")
                
                # Small delay to avoid overwhelming the server
                time.sleep(0.5)
                
            except Exception as e:
                log(f"❌ Error processing email {email_id}: {e}")
                continue
        
        # Summary
        log("=" * 50)
        log(f"📊 PROCESSING COMPLETE")
        log(f"📧 Total emails processed: {processed_emails}/{total_emails}")
        log(f"📎 Total PDFs processed: {processed_pdfs}")
        
        # Count generated JSON files
        json_count = 0
        if os.path.exists("output_jsons"):
            json_files = [f for f in os.listdir("output_jsons") if f.endswith('.json')]
            json_count = len(json_files)
        
        log(f"📄 JSON files generated: {json_count}")
        log(f"📁 Check 'output_jsons/' for parsed results")
        log(f"📁 Check 'email_invoices/' for downloaded PDFs")
        log(f"📋 Check 'invoice_queue.json' for queue status")
        log("=" * 50)
        
        # Close connection
        mail.close()
        mail.logout()
        log("🔌 Disconnected from email server")
        
    except Exception as e:
        log(f"❌ Error in process_all_emails: {e}")

def main():
    """Main function"""
    log("🎯 PCS AI - Process All Existing Emails")
    log("=" * 50)
    
    # Check if required files exist
    required_files = ['vendor_router.py', 'epic_parser.py']
    missing_files = []
    
    for file in required_files:
        if not os.path.exists(file):
            missing_files.append(file)
    
    if missing_files:
        log(f"❌ Missing required files: {', '.join(missing_files)}")
        log("Please ensure all parser files are in the current directory")
        return
    
    # Process all emails
    process_all_emails()

if __name__ == "__main__":
    main()