#!/usr/bin/env python3
"""
Bulk Email Inbox Extractor - One-time comprehensive invoice extraction
Extracts ALL invoices from 1000+ emails in the inbox sequentially
Uses a single IMAP connection to avoid SSL issues
"""

import imaplib
import email
from email.header import decode_header
import os
import sys
import time
import hashlib
from datetime import datetime

EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVE_DIR = os.path.join(BASE_DIR, "email_invoices")

os.makedirs(SAVE_DIR, exist_ok=True)

extracted_count = 0
skipped_count = 0
error_count = 0
start_time = time.time()

def log(msg):
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] {msg}")

def get_email_subject(msg):
    """Safely decode email subject"""
    try:
        subject = msg.get("Subject", "")
        if isinstance(subject, str):
            return subject
        decoded_parts = decode_header(subject)
        return "".join([part[0].decode(part[1] or 'utf-8') if isinstance(part[0], bytes) else part[0] for part in decoded_parts])
    except:
        return ""

def extract_pdfs_from_email(msg, message_id):
    """Extract all PDFs from an email message"""
    pdfs = 0
    try:
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
                try:
                    # Create unique filename
                    name_without_ext = os.path.splitext(filename)[0]
                    unique_filename = f"{name_without_ext}_{hashlib.md5(message_id.encode()).hexdigest()[:8]}.pdf"
                    filepath = os.path.join(SAVE_DIR, unique_filename)

                    # Save PDF
                    with open(filepath, 'wb') as f:
                        f.write(part.get_payload(decode=True))

                    pdfs += 1
                except Exception as e:
                    pass

        return pdfs
    except Exception as e:
        return 0

def main():
    global extracted_count, skipped_count, error_count, start_time

    log("=" * 60)
    log("BULK EMAIL INBOX EXTRACTOR (Sequential)")
    log("=" * 60)
    log(f"Connecting to {IMAP_SERVER}...")

    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, timeout=30)
        mail.login(EMAIL_USER, EMAIL_PASS)
        log("✅ Connected to email server")

        # Select inbox
        status, mailbox_data = mail.select("INBOX")
        if status != 'OK':
            log("❌ Failed to select INBOX")
            return

        # Get ALL message IDs
        status, msg_ids = mail.search(None, "ALL")
        if status != 'OK':
            log("❌ Failed to search emails")
            return

        msg_id_list = msg_ids[0].split()
        total_emails = len(msg_id_list)
        log(f"📧 Found {total_emails} emails in inbox")
        log(f"🔄 Processing emails sequentially...")

        # Process emails sequentially
        for idx, msg_id in enumerate(msg_id_list):
            try:
                status, msg_data = mail.fetch(msg_id, "(RFC822)")
                if status != 'OK':
                    error_count += 1
                    continue

                msg = email.message_from_bytes(msg_data[0][1])
                subject = get_email_subject(msg)
                message_id = msg.get("Message-ID", msg_id.decode() if isinstance(msg_id, bytes) else msg_id)

                pdfs = extract_pdfs_from_email(msg, message_id)

                if pdfs > 0:
                    extracted_count += pdfs
                    log(f"✅ [{idx+1}/{total_emails}] Extracted {pdfs} PDF(s): {subject[:50]}")
                else:
                    skipped_count += 1

                # Progress every 100 emails
                if (idx + 1) % 100 == 0:
                    log(f"📊 Progress: {idx+1}/{total_emails} emails processed")

            except Exception as e:
                error_count += 1
                if (idx + 1) % 100 == 0:
                    log(f"⚠️  Error on email {idx+1}: {str(e)[:50]}")

        mail.close()
        mail.logout()

        duration_sec = time.time() - start_time
        log("=" * 60)
        log("EXTRACTION COMPLETE")
        log("=" * 60)
        log(f"✅ Extracted: {extracted_count} PDFs")
        log(f"⏭️  Skipped: {skipped_count} emails (no PDFs)")
        log(f"❌ Errors: {error_count}")
        log(f"⏱️  Duration: {duration_sec:.1f}s")
        log(f"📁 Saved to: {SAVE_DIR}")
        log("=" * 60)

    except Exception as e:
        log(f"❌ Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

