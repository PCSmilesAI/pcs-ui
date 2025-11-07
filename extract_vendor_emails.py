#!/usr/bin/env python3
"""
Extract vendor email addresses from the email inbox.
This script connects to the email inbox and analyzes all emails to find
the consistent sender email for each vendor.
"""

import imaplib
import email
from email.header import decode_header
from collections import defaultdict
import re
import json

EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"

# Vendor keywords for detection
VENDOR_KEYWORDS = {
    'Artisan Dental': ['artisan', 'artisan dental'],
    'Exodus Dental Solutions': ['exodus', 'exodus dental'],
    'Henry Schein': ['henry', 'henry schein'],
    'Patterson Dental': ['patterson', 'patterson dental'],
    'TC Dental': ['tc dental', 'tc dental lab'],
    'Epic Dental Lab': ['epic', 'epic dental', 'epicdentallab'],
}

def connect_imap():
    """Connect to email server"""
    mail = imaplib.IMAP4_SSL(IMAP_SERVER)
    mail.login(EMAIL_USER, EMAIL_PASS)
    return mail

def extract_email_address(from_header):
    """Extract email address from From header"""
    # Handle format: "Name <email@domain.com>" or just "email@domain.com"
    match = re.search(r'<(.+?)>', from_header)
    if match:
        return match.group(1).lower()
    return from_header.lower()

def detect_vendor_from_email(msg):
    """Detect vendor from email sender, subject, or body"""
    # Check sender email
    sender = msg.get('From', '').lower()
    for vendor, keywords in VENDOR_KEYWORDS.items():
        if any(keyword in sender for keyword in keywords):
            return vendor
    
    # Check subject
    subject = msg.get('Subject', '').lower()
    for vendor, keywords in VENDOR_KEYWORDS.items():
        if any(keyword in subject for keyword in keywords):
            return vendor
    
    # Check email body
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    body += part.get_payload(decode=True).decode('utf-8', errors='ignore').lower()
                except:
                    pass
    else:
        try:
            body = msg.get_payload(decode=True).decode('utf-8', errors='ignore').lower()
        except:
            pass
    
    for vendor, keywords in VENDOR_KEYWORDS.items():
        if any(keyword in body for keyword in keywords):
            return vendor
    
    return None

def scan_inbox():
    """Scan inbox and extract vendor emails"""
    print("🔍 Connecting to email server...")
    mail = connect_imap()
    
    # Get all folders
    status, mailboxes = mail.list()
    print(f"📁 Found {len(mailboxes)} mailboxes")
    
    vendor_emails = defaultdict(lambda: defaultdict(int))
    email_count = 0
    
    # Scan INBOX and Processed folders
    for folder_name in ['INBOX', 'Processed']:
        try:
            print(f"\n📧 Scanning {folder_name}...")
            mail.select(folder_name)
            status, messages = mail.uid('search', None, 'ALL')
            
            if status != 'OK':
                print(f"⚠️ Could not search {folder_name}")
                continue
            
            uids = messages[0].split()
            print(f"   Found {len(uids)} emails in {folder_name}")
            
            for uid in uids:
                try:
                    status, msg_data = mail.uid('fetch', uid, '(RFC822)')
                    if status != 'OK':
                        continue
                    
                    msg = email.message_from_bytes(msg_data[0][1])
                    from_header = msg.get('From', '')
                    subject = msg.get('Subject', '')
                    
                    if isinstance(subject, bytes):
                        subject = decode_header(subject)[0][0]
                        if isinstance(subject, bytes):
                            subject = subject.decode(errors='ignore')
                    
                    vendor = detect_vendor_from_email(msg)
                    
                    if vendor and from_header:
                        email_addr = extract_email_address(from_header)
                        vendor_emails[vendor][email_addr] += 1
                        email_count += 1
                        
                        if email_count % 50 == 0:
                            print(f"   Processed {email_count} emails...")
                
                except Exception as e:
                    print(f"   ⚠️ Error processing email: {e}")
                    continue
        
        except Exception as e:
            print(f"⚠️ Error scanning {folder_name}: {e}")
            continue
    
    mail.logout()
    return vendor_emails, email_count

def main():
    print("=" * 60)
    print("VENDOR EMAIL EXTRACTION TOOL")
    print("=" * 60)
    
    vendor_emails, total_emails = scan_inbox()
    
    print(f"\n✅ Scanned {total_emails} emails total\n")
    print("=" * 60)
    print("VENDOR EMAIL SUMMARY")
    print("=" * 60)
    
    vendor_map = {}
    
    for vendor in sorted(vendor_emails.keys()):
        emails = vendor_emails[vendor]
        total = sum(emails.values())
        
        print(f"\n📦 {vendor}")
        print(f"   Total emails: {total}")
        
        # Sort by frequency
        sorted_emails = sorted(emails.items(), key=lambda x: x[1], reverse=True)
        
        for email_addr, count in sorted_emails:
            percentage = (count / total) * 100
            print(f"   • {email_addr}: {count} emails ({percentage:.1f}%)")
        
        # Use the most common email
        primary_email = sorted_emails[0][0]
        vendor_map[vendor] = primary_email
        print(f"   ✓ Primary email: {primary_email}")
    
    print("\n" + "=" * 60)
    print("VENDOR STRIPE MAP UPDATE")
    print("=" * 60)
    print("\nAdd these emails to your vendor_stripe_map.json:")
    print(json.dumps(vendor_map, indent=2))
    
    print("\n" + "=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print("""
1. Update vendor_stripe_map.json with the email addresses above
2. Set COMPANY_NAME=Pacific Crest Smiles in your environment
3. Configure email provider (SENDGRID_API_KEY, MAILJET_API_KEY, or SMTP_*)
4. Test by paying an invoice - remittance email should be sent!
    """)

if __name__ == "__main__":
    main()

