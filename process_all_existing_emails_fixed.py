#!/usr/bin/env python3
"""
FIXED Process All Existing Emails Script
Fixes the filename collision and overly aggressive duplicate detection issues.
"""

import os
import sys
import imaplib
import email
import time
from email.header import decode_header
import subprocess
import json
from datetime import datetime
import re
import hashlib

# Configuration
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"
IMAP_PORT = 993
SAVE_DIR = "email_invoices"
INVOICE_QUEUE_PATH = os.path.join("pcs_ai_data", "invoice_queue.json")

def log(msg):
    """Custom logging function"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def create_directories():
    """Create necessary directories if they don't exist"""
    directories = [SAVE_DIR, "pcs_ai_data", "output_jsons"]
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)
            log(f"📁 Created directory: {directory}")

def load_existing_invoices():
    """Load existing invoices from PCS AI system"""
    if not os.path.exists(INVOICE_QUEUE_PATH):
        return []
    
    try:
        with open(INVOICE_QUEUE_PATH, 'r') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception as e:
        log(f"❌ Error loading existing invoices: {e}")
        return []

def generate_unique_filename(original_filename, email_subject, email_date, attachment_index):
    """Generate a unique filename to avoid collisions"""
    # Get base name and extension
    name, ext = os.path.splitext(original_filename)
    
    # Create a hash from email content for uniqueness
    content_hash = hashlib.md5(f"{email_subject}_{email_date}_{attachment_index}".encode()).hexdigest()[:8]
    
    # Format: email_{index}_{date}_{original_name}_{hash}.pdf
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_name = f"email_{attachment_index}_{date_str}_{name}_{content_hash}{ext}"
    
    return unique_name

def is_pdf_already_processed(pdf_content):
    """Check if this exact PDF content is already saved"""
    content_hash = hashlib.md5(pdf_content).hexdigest()
    
    # Check existing PDFs for same content hash
    for filename in os.listdir(SAVE_DIR):
        if filename.endswith('.pdf'):
            filepath = os.path.join(SAVE_DIR, filename)
            try:
                with open(filepath, 'rb') as f:
                    existing_hash = hashlib.md5(f.read()).hexdigest()
                if existing_hash == content_hash:
                    log(f"📋 PDF content already exists as: {filename}")
                    return True, filename
            except Exception:
                continue
    
    return False, None

def extract_invoice_number_from_subject(subject):
    """Extract potential invoice numbers from email subject"""
    if not subject:
        return None
    
    # Common patterns for invoice numbers
    patterns = [
        r'invoice\s*#?\s*(\d+)',
        r'inv\s*#?\s*(\d+)',
        r'bill\s*#?\s*(\d+)',
        r'#(\d{4,})',  # 4+ digit numbers
        r'(\d{4,})',   # 4+ digit numbers anywhere
    ]
    
    for pattern in patterns:
        match = re.search(pattern, subject.lower())
        if match:
            return match.group(1)
    
    return None

def should_skip_email_processing(email_subject, pdf_content):
    """
    More intelligent duplicate detection.
    Only skip if we have the EXACT SAME PDF content, not just same invoice number.
    """
    already_processed, existing_filename = is_pdf_already_processed(pdf_content)
    if already_processed:
        log(f"✅ PDF content already processed as: {existing_filename}")
        return True
    
    return False

def detect_vendor_from_email(msg):
    """Detect vendor from email content"""
    sender = msg.get("From", "").lower()
    subject = msg.get("Subject", "").lower()
    
    vendor_patterns = {
        'epic': ['epic', 'epic dental'],
        'patterson': ['patterson', 'pattersondental'],
        'henry': ['henry schein', 'henryschein'],
        'exodus': ['exodus', 'exodus dental'],
        'artisan': ['artisan', 'artisan dental'],
        'tc': ['tc dental', 'tc dental supply']
    }
    
    for vendor, patterns in vendor_patterns.items():
        for pattern in patterns:
            if pattern in sender or pattern in subject:
                return vendor
    return None

def run_vendor_router(filepath, detected_vendor=None):
    """Run the vendor router to parse the PDF"""
    try:
        cmd = ["python3", "vendor_router.py", filepath]
        if detected_vendor:
            cmd.append(detected_vendor)
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            log(f"❌ Vendor router failed: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        log(f"⏰ Vendor router timeout for {filepath}")
        return None
    except Exception as e:
        log(f"❌ Vendor router error: {e}")
        return None

def process_email_invoices():
    """Process all emails in the inbox with improved duplicate handling"""
    log("🚀 Starting FIXED email processing...")
    
    try:
        # Connect to email server
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_USER, EMAIL_PASS)
        mail.select("INBOX")
        
        # Get all emails
        status, messages = mail.search(None, 'ALL')
        if status != 'OK':
            log("❌ Failed to search inbox")
            return False
        
        email_ids = messages[0].split()
        log(f"📧 Found {len(email_ids)} emails in inbox")
        
        processed_count = 0
        skipped_count = 0
        error_count = 0
        attachment_index = 1
        
        for email_id in email_ids:
            try:
                # Fetch email
                status, msg_data = mail.fetch(email_id, '(RFC822)')
                if status != 'OK':
                    continue
                
                msg = email.message_from_bytes(msg_data[0][1])
                subject = decode_header(msg["Subject"])[0][0]
                if isinstance(subject, bytes):
                    subject = subject.decode(errors='ignore')
                
                email_date = msg.get("Date", "")
                
                # Check if email has PDF attachments
                has_pdf = False
                pdf_attachments = []
                
                for part in msg.walk():
                    if part.get('Content-Disposition') is not None:
                        filename = part.get_filename()
                        if filename and filename.lower().endswith(".pdf"):
                            has_pdf = True
                            pdf_content = part.get_payload(decode=True)
                            pdf_attachments.append((filename, pdf_content))
                
                if not has_pdf:
                    log(f"⏩ Skipped email (no PDF): {subject}")
                    skipped_count += 1
                    continue
                
                log(f"📧 Processing email with {len(pdf_attachments)} PDF(s): {subject}")
                
                # Detect vendor
                detected_vendor = detect_vendor_from_email(msg)
                if detected_vendor:
                    log(f"🔍 Detected vendor: {detected_vendor}")
                
                # Process each PDF attachment
                email_processed_pdfs = 0
                for original_filename, pdf_content in pdf_attachments:
                    # Check if this exact PDF content is already processed
                    if should_skip_email_processing(subject, pdf_content):
                        log(f"⏩ Skipped duplicate PDF content: {original_filename}")
                        skipped_count += 1
                        continue
                    
                    # Generate unique filename
                    unique_filename = generate_unique_filename(
                        original_filename, subject, email_date, attachment_index
                    )
                    filepath = os.path.join(SAVE_DIR, unique_filename)
                    
                    # Save PDF with unique name
                    with open(filepath, 'wb') as f:
                        f.write(pdf_content)
                    log(f"✅ Saved: {filepath}")
                    
                    # Run vendor router
                    vendor = run_vendor_router(filepath, detected_vendor)
                    if vendor:
                        log(f"📦 Parsed and routed invoice: {vendor}")
                        email_processed_pdfs += 1
                    else:
                        log("⏩ Ignored: unknown or unparseable vendor")
                        error_count += 1
                    
                    attachment_index += 1
                
                if email_processed_pdfs > 0:
                    processed_count += email_processed_pdfs
                
            except Exception as e:
                log(f"❌ Error processing email {email_id}: {e}")
                error_count += 1
                continue
        
        log(f"✅ Processing complete!")
        log(f"📊 Processed: {processed_count} new PDF invoices")
        log(f"⏩ Skipped: {skipped_count} existing/duplicate PDFs")
        log(f"❌ Errors: {error_count} failed")
        
        mail.logout()
        return True
        
    except Exception as e:
        log(f"❌ Exception in email processing: {e}")
        return False

def main():
    """Main function"""
    log("🚀 FIXED Email Invoice Processor")
    log("🔧 Features: unique filenames, content-based duplicate detection")
    create_directories()
    
    if process_email_invoices():
        log("✅ Email processing completed successfully")
        log("📋 Run 'python3 consolidate_invoices.py' to update the invoice queue")
    else:
        log("❌ Email processing failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
