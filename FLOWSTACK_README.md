# PCS AI Invoice Processing Flowstack

## 🎯 Complete Flow Overview

```
Email arrives → Vendor Detection → PDF Download → Parser Routing → JSON Generation → UI Upload
     ↓              ↓                ↓              ↓              ↓              ↓
📧 inbox      🔍 email/PDF      📁 email_invoices  🚦 vendor_router  📋 output_jsons  🖥️ PCS AI UI
```

## 📋 Flow Components

### 1. **Email Ingestion Agent** (`email_ingestion_agent.py`)
- **Purpose**: Monitors `invoices@pcsmilesai.com` for new emails
- **Function**: 
  - Detects vendor from email sender, subject, or body
  - Downloads PDF attachments to `email_invoices/` folder
  - Routes to vendor parser via `vendor_router.py`
- **Vendor Detection**: Supports Epic, Patterson, Henry, Exodus, Artisan, TC Dental

### 2. **Vendor Router** (`vendor_router.py`)
- **Purpose**: Routes PDFs to correct vendor parser
- **Function**:
  - Uses email-detected vendor if available
  - Falls back to PDF content analysis
  - Runs appropriate parser (epic_parser.py, etc.)
- **Supported Vendors**:
  - `epic` → `epic_parser.py`
  - `patterson` → `patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py`
  - `henry` → `henry_parser.py`
  - `exodus` → `exodus_parser.py`
  - `artisan` → `parse_artisan_dental_exporting_fixed.py`
  - `tc` → `parse_tc_dental_invoice.py`

### 3. **Invoice Queue Writer** (`invoice_queue_writer.py`)
- **Purpose**: Monitors for new JSON files and manages invoice queue
- **Function**:
  - Watches `output_jsons/` folder for new parsed invoices
  - Adds invoices to `invoice_queue.json`
  - Tracks invoice status and metadata

### 4. **UI Upload Service** (`ui_upload_service.py`)
- **Purpose**: Uploads parsed invoices to PCS AI UI
- **Function**:
  - Monitors invoice queue for new items
  - Loads JSON data and PDF files
  - Uploads to UI (appears in "For Me" and "All Invoices" tabs)
  - Marks invoices as uploaded

### 5. **Flowstack Orchestrator** (`flowstack_orchestrator.py`)
- **Purpose**: Master controller that runs all components
- **Function**:
  - Starts all services simultaneously
  - Monitors and restarts failed components
  - Provides unified logging and management

## 🚀 Quick Start

### Option 1: Run Everything (Recommended)
```bash
python3 flowstack_orchestrator.py
```

### Option 2: Run Components Individually
```bash
# Terminal 1: Email monitoring
python3 email_ingestion_agent.py

# Terminal 2: Queue management
python3 invoice_queue_writer.py

# Terminal 3: UI uploads
python3 ui_upload_service.py
```

## 📁 Directory Structure

```
pcs-ui/
├── email_invoices/          # Downloaded PDFs from emails
├── output_jsons/           # Parsed invoice JSON files
├── processed_invoices/     # Legacy folder (not used in new flow)
├── email_ingestion_agent.py
├── vendor_router.py
├── invoice_queue_writer.py
├── ui_upload_service.py
├── flowstack_orchestrator.py
├── epic_parser.py          # Epic Dental Lab parser
├── patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py
├── henry_parser.py
├── exodus_parser.py
├── parse_artisan_dental_exporting_fixed.py
├── parse_tc_dental_invoice.py
└── invoice_queue.json      # Invoice processing queue
```

## 🔄 Complete Flow Example

1. **Email Arrives**: `invoices@pcsmilesai.com` receives invoice from Epic Dental Lab
2. **Vendor Detection**: Email agent detects "epic" from sender/subject
3. **PDF Download**: Invoice saved to `email_invoices/epic_invoice_123.pdf`
4. **Parser Routing**: `vendor_router.py` routes to `epic_parser.py`
5. **JSON Generation**: Parser creates `output_jsons/epic_invoice_123_parsed.json`
6. **Queue Addition**: `invoice_queue_writer.py` adds to queue
7. **UI Upload**: `ui_upload_service.py` uploads to PCS AI UI
8. **UI Display**: Invoice appears in "For Me" tab and "All Invoices" tab

## 📊 Logging

All components log to:
- `log.txt` - Email ingestion logs
- `ui_upload.log` - UI upload service logs  
- `flowstack.log` - Orchestrator logs

## ⚙️ Configuration

### Email Settings
```python
EMAIL_USER = "invoices@pcsmilesai.com"
EMAIL_PASS = "Inv!PCSAI"
IMAP_SERVER = "imap.secureserver.net"
```

### Vendor Keywords
```python
vendor_keywords = {
    'epic': ['epic', 'epic dental', 'epicdentallab'],
    'patterson': ['patterson', 'patterson dental'],
    'henry': ['henry', 'henry schein'],
    'exodus': ['exodus', 'exodus dental'],
    'artisan': ['artisan', 'artisan dental'],
    'tc': ['tc dental', 'tc dental lab']
}
```

## 🛠️ Dependencies

```bash
pip3 install watchdog
```

## 🔧 Troubleshooting

### Common Issues

1. **Email not detected**: Check IMAP credentials and server settings
2. **Parser not found**: Ensure all vendor parsers exist in directory
3. **JSON not generated**: Check parser output and error logs
4. **UI not updating**: Verify UI service is running and connected

### Debug Mode

Run individual components with verbose logging:
```bash
python3 -u email_ingestion_agent.py
python3 -u vendor_router.py test_invoice.pdf
```

## 📈 Monitoring

The orchestrator provides real-time status:
- ✅ Component status (running/stopped)
- 📊 Process IDs and restart counts
- 🔄 Automatic restart on failures
- 📝 Comprehensive logging

## 🎯 Next Steps

1. **UI Integration**: Connect upload service to actual PCS AI UI endpoints
2. **Database**: Replace file-based queue with database storage
3. **Authentication**: Add secure API authentication
4. **Scaling**: Add load balancing and multiple instances
5. **Analytics**: Add invoice processing metrics and reporting 