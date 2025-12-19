#!/usr/bin/env python3
"""
Attachment Audit Script

Scans the email inbox and local files to:
1. Discover all attachment types (PDF, images, docs, etc.)
2. Identify emails with/without attachments
3. Find invoices in the system missing attachment links
4. Report statistics on attachment types
"""

import os
import sys
import json
import imaplib
import email
from email.header import decode_header
from collections import defaultdict
from datetime import datetime

# Email configuration
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"
IMAP_PORT = 993

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PCS_DATA_DIR', os.path.join(BASE_DIR, 'pcs_ui_data'))
EMAIL_INVOICES_DIR = os.path.join(BASE_DIR, 'email_invoices')
INVOICE_QUEUE_PATH = os.path.join(DATA_DIR, 'invoice_queue.json')


def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")


def connect_imap():
    """Connect to email server"""
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_USER, EMAIL_PASS)
        return mail
    except Exception as e:
        log(f"❌ Failed to connect to email: {e}")
        return None


def decode_subject(subject):
    """Decode email subject"""
    if subject is None:
        return ""
    decoded = decode_header(subject)
    result = ""
    for part, encoding in decoded:
        if isinstance(part, bytes):
            result += part.decode(encoding or 'utf-8', errors='ignore')
        else:
            result += str(part)
    return result


def get_attachment_info(msg):
    """Extract all attachment information from an email"""
    attachments = []
    
    for part in msg.walk():
        # Skip multipart containers
        if part.get_content_maintype() == 'multipart':
            continue
        
        # Get filename from various sources
        filename = part.get_filename()
        
        # Try Content-Type parameters if no filename
        if not filename:
            content_type = part.get_content_type()
            params = part.get_params()
            if params:
                for key, value in params:
                    if key.lower() == 'name':
                        filename = value
                        break
        
        # Skip if no filename (probably inline content)
        if not filename:
            continue
        
        # Get file extension
        ext = os.path.splitext(filename.lower())[1]
        content_type = part.get_content_type()
        
        # Get file size
        payload = part.get_payload(decode=True)
        size = len(payload) if payload else 0
        
        attachments.append({
            'filename': filename,
            'extension': ext,
            'content_type': content_type,
            'size': size,
        })
    
    return attachments


def audit_email_inbox():
    """Audit the email inbox for attachment types"""
    log("📧 Connecting to email inbox...")
    mail = connect_imap()
    if not mail:
        return None
    
    try:
        mail.select("INBOX")
        
        # Get all emails
        result, data = mail.search(None, "ALL")
        if result != "OK":
            log("❌ Failed to search inbox")
            return None
        
        email_ids = data[0].split()
        total_emails = len(email_ids)
        log(f"📬 Found {total_emails} emails in inbox")
        
        # Statistics
        stats = {
            'total_emails': total_emails,
            'emails_with_attachments': 0,
            'emails_without_attachments': 0,
            'attachment_types': defaultdict(int),
            'content_types': defaultdict(int),
            'vendor_emails': defaultdict(list),
            'sample_emails_no_attachments': [],
            'all_attachments': [],
        }
        
        # Process each email
        for i, email_id in enumerate(email_ids):
            try:
                result, msg_data = mail.fetch(email_id, "(RFC822)")
                if result != "OK":
                    continue
                
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)
                
                # Get email metadata
                subject = decode_subject(msg.get("Subject", ""))
                sender = msg.get("From", "")
                date = msg.get("Date", "")
                
                # Get attachments
                attachments = get_attachment_info(msg)
                
                if attachments:
                    stats['emails_with_attachments'] += 1
                    
                    for att in attachments:
                        stats['attachment_types'][att['extension']] += 1
                        stats['content_types'][att['content_type']] += 1
                        stats['all_attachments'].append({
                            'filename': att['filename'],
                            'extension': att['extension'],
                            'size': att['size'],
                            'email_subject': subject[:50],
                            'sender': sender,
                        })
                else:
                    stats['emails_without_attachments'] += 1
                    if len(stats['sample_emails_no_attachments']) < 20:
                        stats['sample_emails_no_attachments'].append({
                            'subject': subject[:100],
                            'sender': sender,
                            'date': date,
                        })
                
                # Progress
                if (i + 1) % 100 == 0:
                    log(f"  Processed {i + 1}/{total_emails} emails...")
                    
            except Exception as e:
                log(f"  ⚠️ Error processing email {email_id}: {e}")
                continue
        
        mail.logout()
        return stats
        
    except Exception as e:
        log(f"❌ Error auditing inbox: {e}")
        mail.logout()
        return None


def audit_local_files():
    """Audit local attachment files"""
    log("📁 Auditing local attachment files...")
    
    if not os.path.exists(EMAIL_INVOICES_DIR):
        log(f"❌ Directory not found: {EMAIL_INVOICES_DIR}")
        return None
    
    files = os.listdir(EMAIL_INVOICES_DIR)
    
    stats = {
        'total_files': len(files),
        'file_types': defaultdict(int),
        'files_by_type': defaultdict(list),
    }
    
    for f in files:
        ext = os.path.splitext(f.lower())[1]
        stats['file_types'][ext] += 1
        if len(stats['files_by_type'][ext]) < 10:
            stats['files_by_type'][ext].append(f)
    
    return stats


def audit_invoice_queue():
    """Audit invoice queue for missing attachments"""
    log("📋 Auditing invoice queue for missing attachments...")
    
    if not os.path.exists(INVOICE_QUEUE_PATH):
        log(f"❌ Invoice queue not found: {INVOICE_QUEUE_PATH}")
        return None
    
    with open(INVOICE_QUEUE_PATH, 'r') as f:
        data = json.load(f)
    
    # Handle both formats
    if isinstance(data, dict) and 'invoices' in data:
        invoices = data['invoices']
    elif isinstance(data, list):
        invoices = data
    else:
        invoices = []
    
    stats = {
        'total_invoices': len(invoices),
        'with_pdf_path': 0,
        'missing_pdf_path': 0,
        'pdf_exists': 0,
        'pdf_missing': 0,
        'missing_pdf_samples': [],
    }
    
    for inv in invoices:
        pdf_path = inv.get('pdf_path', '')
        
        if pdf_path:
            stats['with_pdf_path'] += 1
            
            # Check if file exists
            if pdf_path.startswith('/api/pdf/'):
                filename = pdf_path.replace('/api/pdf/', '')
                full_path = os.path.join(EMAIL_INVOICES_DIR, filename)
            else:
                full_path = pdf_path
            
            if os.path.exists(full_path):
                stats['pdf_exists'] += 1
            else:
                stats['pdf_missing'] += 1
                if len(stats['missing_pdf_samples']) < 10:
                    stats['missing_pdf_samples'].append({
                        'invoice_number': inv.get('invoice_number'),
                        'vendor': inv.get('vendor'),
                        'pdf_path': pdf_path,
                    })
        else:
            stats['missing_pdf_path'] += 1
            if len(stats['missing_pdf_samples']) < 10:
                stats['missing_pdf_samples'].append({
                    'invoice_number': inv.get('invoice_number'),
                    'vendor': inv.get('vendor'),
                    'pdf_path': 'NONE',
                })
    
    return stats


def generate_report(email_stats, local_stats, queue_stats):
    """Generate comprehensive audit report"""
    
    report = {
        'generated_at': datetime.now().isoformat(),
        'email_inbox': email_stats,
        'local_files': local_stats,
        'invoice_queue': queue_stats,
    }
    
    # Print summary
    print("\n" + "=" * 70)
    print("ATTACHMENT AUDIT REPORT")
    print("=" * 70)
    
    if email_stats:
        print("\n📧 EMAIL INBOX ANALYSIS")
        print("-" * 40)
        print(f"Total emails: {email_stats['total_emails']}")
        print(f"Emails WITH attachments: {email_stats['emails_with_attachments']}")
        print(f"Emails WITHOUT attachments: {email_stats['emails_without_attachments']}")
        
        print("\n📎 ATTACHMENT TYPES FOUND:")
        for ext, count in sorted(email_stats['attachment_types'].items(), key=lambda x: -x[1]):
            pct = (count / sum(email_stats['attachment_types'].values())) * 100
            print(f"  {ext or '(no ext)'}: {count} ({pct:.1f}%)")
        
        print("\n📄 CONTENT TYPES:")
        for ct, count in sorted(email_stats['content_types'].items(), key=lambda x: -x[1])[:10]:
            print(f"  {ct}: {count}")
        
        if email_stats['sample_emails_no_attachments']:
            print("\n⚠️ SAMPLE EMAILS WITHOUT ATTACHMENTS:")
            for e in email_stats['sample_emails_no_attachments'][:5]:
                print(f"  - {e['subject'][:60]}...")
                print(f"    From: {e['sender'][:50]}")
    
    if local_stats:
        print("\n📁 LOCAL FILES ANALYSIS")
        print("-" * 40)
        print(f"Total files: {local_stats['total_files']}")
        
        print("\n📎 FILE TYPES:")
        for ext, count in sorted(local_stats['file_types'].items(), key=lambda x: -x[1]):
            pct = (count / local_stats['total_files']) * 100
            print(f"  {ext or '(no ext)'}: {count} ({pct:.1f}%)")
    
    if queue_stats:
        print("\n📋 INVOICE QUEUE ANALYSIS")
        print("-" * 40)
        print(f"Total invoices: {queue_stats['total_invoices']}")
        print(f"With PDF path: {queue_stats['with_pdf_path']}")
        print(f"Missing PDF path: {queue_stats['missing_pdf_path']}")
        print(f"PDF file exists: {queue_stats['pdf_exists']}")
        print(f"PDF file missing: {queue_stats['pdf_missing']}")
        
        if queue_stats['missing_pdf_samples']:
            print("\n❌ INVOICES MISSING PDFs:")
            for inv in queue_stats['missing_pdf_samples']:
                print(f"  - {inv['invoice_number']} ({inv['vendor']})")
                print(f"    Path: {inv['pdf_path']}")
    
    print("\n" + "=" * 70)
    
    # Save report
    report_path = os.path.join(BASE_DIR, 'attachment_audit_report.json')
    with open(report_path, 'w') as f:
        # Convert defaultdicts to regular dicts for JSON
        if email_stats:
            email_stats['attachment_types'] = dict(email_stats['attachment_types'])
            email_stats['content_types'] = dict(email_stats['content_types'])
            email_stats['vendor_emails'] = dict(email_stats['vendor_emails'])
        if local_stats:
            local_stats['file_types'] = dict(local_stats['file_types'])
            local_stats['files_by_type'] = dict(local_stats['files_by_type'])
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Full report saved to: {report_path}")
    
    return report


def main():
    log("🔍 Starting Attachment Audit")
    log("=" * 50)
    
    # Audit email inbox
    email_stats = audit_email_inbox()
    
    # Audit local files
    local_stats = audit_local_files()
    
    # Audit invoice queue
    queue_stats = audit_invoice_queue()
    
    # Generate report
    report = generate_report(email_stats, local_stats, queue_stats)
    
    return report


if __name__ == '__main__':
    main()





