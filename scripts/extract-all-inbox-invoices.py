#!/usr/bin/env python3
"""
Temporary script to extract ALL invoices from email inbox and add them to the database.
This is a one-time bulk import tool.
"""

import imaplib
import email
from email.header import decode_header
import os
import sys
import subprocess
import sqlite3
from datetime import datetime
from pathlib import Path

# Email credentials
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("PCS_DATA_DIR", os.path.join(BASE_DIR, "pcs_ui_data"))
SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")
VENDOR_ROUTER_PATH = os.path.join(BASE_DIR, "vendor_router.py")
DB_PATH = os.path.join(DATA_DIR, "pcs.db")

os.makedirs(SAVE_DIR, exist_ok=True)

def log(msg):
    """Print with timestamp"""
    print(f"[{datetime.now().isoformat()}] {msg}")

def connect_imap():
    """Connect to IMAP server"""
    mail = imaplib.IMAP4_SSL(IMAP_SERVER)
    mail.login(EMAIL_USER, EMAIL_PASS)
    return mail

def extract_pdfs_from_email(msg, email_subject, source_message_id):
    """Extract all PDFs from an email"""
    pdf_files = []
    
    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue
        
        filename = part.get_filename()
        if not filename:
            content_type = part.get_content_type()
            if content_type.startswith('application/'):
                params = part.get_params()
                if params:
                    for key, value in params:
                        if key.lower() == 'name':
                            filename = value
                            break
        
        if filename and filename.lower().endswith(".pdf"):
            # Save PDF
            unique_id = source_message_id.replace("<", "").replace(">", "")[:16] if source_message_id else "unknown"
            safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ")
            output_filename = f"{safe_filename.replace('.pdf', '')}_{unique_id}.pdf"
            filepath = os.path.join(SAVE_DIR, output_filename)
            
            with open(filepath, 'wb') as f:
                f.write(part.get_payload(decode=True))
            
            log(f"✅ Extracted: {output_filename}")
            pdf_files.append(filepath)
    
    return pdf_files

def parse_pdf_with_vendor_router(filepath):
    """Parse PDF using vendor router"""
    try:
        result = subprocess.run(
            ["python3", VENDOR_ROUTER_PATH, filepath],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0 and result.stdout.strip():
            vendor = result.stdout.strip()
            log(f"📦 Parsed: {os.path.basename(filepath)} -> {vendor}")
            return True
        else:
            log(f"⚠️ Failed to parse: {os.path.basename(filepath)}")
            return False
    except Exception as e:
        log(f"❌ Error parsing {os.path.basename(filepath)}: {e}")
        return False

def main():
    """Main extraction and import process"""
    log("=" * 60)
    log("STARTING FULL INBOX EXTRACTION")
    log("=" * 60)
    
    try:
        # Connect to email
        log("Connecting to email inbox...")
        mail = connect_imap()
        mail.select("INBOX")
        
        # Get ALL emails
        log("Scanning ALL emails in inbox...")
        status, messages = mail.uid('search', None, 'ALL')
        
        if status != 'OK':
            log("❌ Failed to search inbox")
            return
        
        email_uids = messages[0].split() if messages[0] else []
        log(f"Found {len(email_uids)} total emails")
        
        total_pdfs = 0
        parsed_count = 0
        
        # Process each email
        for idx, uid in enumerate(email_uids, 1):
            if idx % 50 == 0:
                log(f"Progress: {idx}/{len(email_uids)}")
            
            status, msg_data = mail.uid('fetch', uid, '(RFC822)')
            if status != 'OK':
                continue
            
            msg = email.message_from_bytes(msg_data[0][1])
            source_message_id = msg.get("Message-ID", "")
            subject = decode_header(msg["Subject"])[0][0]
            if isinstance(subject, bytes):
                subject = subject.decode(errors='ignore')
            
            # Extract PDFs
            pdfs = extract_pdfs_from_email(msg, subject, source_message_id)
            
            if pdfs:
                total_pdfs += len(pdfs)
                # Parse each PDF
                for pdf_path in pdfs:
                    if parse_pdf_with_vendor_router(pdf_path):
                        parsed_count += 1
        
        mail.logout()
        
        log("=" * 60)
        log(f"EXTRACTION COMPLETE")
        log(f"Total PDFs extracted: {total_pdfs}")
        log(f"Successfully parsed: {parsed_count}")
        log("=" * 60)
        
    except Exception as e:
        log(f"❌ Fatal error: {e}")
        import traceback
        log(traceback.format_exc())

if __name__ == "__main__":
    main()

