# 🔗 PCS AI QuickBooks Integration Guide

## **Overview**

This guide explains how the PCS AI system now seamlessly integrates with QuickBooks Online to create a complete invoice processing workflow:

1. **Parse Invoice** → Extract line items and vendor info
2. **Map to QuickBooks Categories** → Automatically categorize line items
3. **Store in PCS AI Database** → Save parsed data with QuickBooks mappings
4. **Approval Process** → User approves invoice in PCS AI UI
5. **Auto-Create QuickBooks Bill** → Automatically create bill when approved

## **🚀 How It Works**

### **1. QuickBooks Category Synchronization**
- **Automatic Sync**: Categories are synced from QuickBooks when needed
- **Smart Mapping**: Line items are automatically mapped to appropriate QuickBooks expense categories
- **Persistent Storage**: Categories are stored locally for fast lookup
- **Real-time Updates**: Categories stay in sync via webhooks

### **2. Enhanced Invoice Processing**
- **Category Mapping**: Each line item gets mapped to a QuickBooks category
- **Vendor Intelligence**: Vendor names help determine appropriate categories
- **Amount-based Logic**: High-value items are categorized as equipment/capital
- **Confidence Scoring**: Each mapping includes a confidence score

### **3. Automated Bill Creation**
- **Approval Trigger**: Bills are created automatically when invoices are approved
- **PDF Attachment**: Original invoice PDFs are automatically attached
- **Category Preservation**: QuickBooks categories are preserved in the bill
- **Status Tracking**: Complete tracking from PCS AI to QuickBooks

## **🔧 API Endpoints**

### **Category Management**
```bash
# Get all QuickBooks categories
GET /api/qbo/pcs-ai/categories

# Sync categories from QuickBooks
POST /api/qbo/pcs-ai/sync-categories

# Search categories
GET /api/qbo/pcs-ai/categories/search?query=dental
```

### **Enhanced Invoice Processing**
```bash
# Process invoice with QuickBooks integration
POST /api/qbo/pcs-ai/process-invoice-enhanced

# Approve invoice and create QuickBooks bill
POST /api/qbo/pcs-ai/approve-invoice/:invoiceId

# Get all PCS AI invoices
GET /api/qbo/pcs-ai/invoices
```

## **📋 Integration Workflow**

### **Step 1: Initial Setup**
```bash
# 1. Start the development server
npm run dev:api

# 2. Sync QuickBooks categories
curl -X POST http://localhost:3001/api/qbo/pcs-ai/sync-categories
```

### **Step 2: Process Invoice**
```bash
# Process an invoice with QuickBooks integration
curl -X POST http://localhost:3001/api/qbo/pcs-ai/process-invoice-enhanced \
  -H "Content-Type: application/json" \
  -d '{
    "vendorName": "Henry Schein Dental",
    "invoiceNumber": "HS-001",
    "totalAmount": 250.00,
    "lineItems": [
      {
        "description": "Dental Supplies",
        "amount": 150.00
      },
      {
        "description": "Equipment Maintenance",
        "amount": 100.00
      }
    ]
  }'
```

### **Step 3: Approve Invoice**
```bash
# Approve the invoice (creates QuickBooks bill automatically)
curl -X POST http://localhost:3001/api/qbo/pcs-ai/approve-invoice/INVOICE_ID \
  -H "Content-Type: application/json" \
  -d '{
    "approvedBy": "John Doe",
    "notes": "Approved for payment"
  }'
```

## **🧪 Testing the Integration**

### **1. Open the Test Interface**
Navigate to `http://localhost:3001/local-test` in your browser.

### **2. Test Category Syncing**
1. Click **"Sync QuickBooks Categories"** to pull categories from QuickBooks
2. Click **"Get Categories"** to view all available categories
3. Use **"Search Categories"** to find specific categories

### **3. Test Enhanced Processing**
1. Click **"Process Enhanced Invoice"** to process a test invoice
2. Note the invoice ID that gets generated
3. Check that line items are mapped to QuickBooks categories

### **4. Test Invoice Approval**
1. Enter the invoice ID from step 3
2. Click **"Approve Invoice"** to create the QuickBooks bill
3. Check QuickBooks to see the new bill

## **📊 Data Flow**

### **Invoice Processing Flow**
```
PCS AI Invoice → Parse & Extract → Map Categories → Store in Database → Queue for Approval
```

### **Approval Flow**
```
User Approval → Update Status → Create QuickBooks Bill → Attach PDF → Update PCS AI Status
```

### **Category Mapping Flow**
```
Line Item Description → Smart Matching → Vendor Context → Amount Analysis → Best Category
```

## **🔍 Category Mapping Logic**

### **1. Exact Matches**
- **Description**: "Dental Supplies" → "Dental Supplies" category
- **SubType**: "DentalSupplies" → "Dental Supplies" category

### **2. Vendor-Based Matching**
- **Dental Vendor**: Automatically maps to dental/medical categories
- **Equipment Vendor**: Maps to equipment/maintenance categories

### **3. Amount-Based Logic**
- **High Value (>$1000)**: Maps to equipment/capital categories
- **Low Value (<$100)**: Maps to supplies/expense categories

### **4. Fallback Categories**
- **No Match Found**: Uses general expense categories
- **Default**: First available expense category

## **💾 Data Storage**

### **QuickBooks Categories**
```json
{
  "categories": [
    ["1150040000", {
      "id": "1150040000",
      "name": "PCS AI Bill",
      "type": "Expense",
      "subType": "OtherMiscellaneousServiceCost",
      "fullyQualifiedName": "PCS AI Bill"
    }]
  ],
  "mappings": [
    ["pcs ai bill", "1150040000"],
    ["dental supplies", "1234567890"]
  ],
  "lastUpdated": "2025-08-21T20:00:00.000Z"
}
```

### **Enhanced Invoice Structure**
```json
{
  "id": "inv_1234567890_abc123",
  "vendorName": "Henry Schein Dental",
  "invoiceNumber": "HS-001",
  "totalAmount": 250.00,
  "lineItems": [
    {
      "description": "Dental Supplies",
      "amount": 150.00,
      "quickBooksCategory": {
        "id": "1234567890",
        "name": "Dental Supplies",
        "type": "Expense",
        "subType": "DentalSupplies"
      }
    }
  ],
  "status": "pending_approval",
  "processingMetadata": {
    "quickBooksCategoriesSynced": true,
    "categoriesCount": 45
  }
}
```

## **🚨 Error Handling**

### **Common Issues & Solutions**

#### **1. Categories Not Syncing**
```bash
# Check QuickBooks connection
curl http://localhost:3001/health

# Manually sync categories
curl -X POST http://localhost:3001/api/qbo/pcs-ai/sync-categories
```

#### **2. Invoice Processing Fails**
```bash
# Check required fields
{
  "vendorName": "Required",
  "invoiceNumber": "Required", 
  "totalAmount": "Required",
  "lineItems": "Required (array)"
}
```

#### **3. Approval Fails**
```bash
# Check invoice status
GET /api/qbo/pcs-ai/invoices

# Verify QuickBooks connection
GET /health
```

## **📈 Production Deployment**

### **1. Environment Variables**
```bash
# QuickBooks Integration
QBO_CLIENT_ID=your-production-client-id
QBO_CLIENT_SECRET=your-production-client-secret
QBO_ENVIRONMENT=production

# PCS AI Integration
PCS_AI_API_URL=https://api.pcs-ai.com
PCS_AI_API_KEY=your-pcs-ai-api-key
```

### **2. Database Setup**
```bash
# Create data directories
mkdir -p pcs_ai_data
mkdir -p logs
mkdir -p backups

# Set permissions
chmod 755 pcs_ai_data
chmod 755 logs
chmod 755 backups
```

### **3. Monitoring**
```bash
# Health check
curl https://yourdomain.com/health

# Metrics
curl https://yourdomain.com/metrics

# Categories status
curl https://yourdomain.com/api/qbo/pcs-ai/categories
```

## **🔮 Future Enhancements**

### **1. Advanced Category Mapping**
- **Machine Learning**: Learn from user corrections
- **Vendor Templates**: Pre-configured vendor-category mappings
- **Historical Analysis**: Use past invoices to improve mapping

### **2. Real-time Synchronization**
- **Webhook Integration**: Real-time updates from PCS AI
- **Bidirectional Sync**: Changes in QuickBooks update PCS AI
- **Conflict Resolution**: Handle conflicting updates

### **3. Advanced Analytics**
- **Processing Metrics**: Track processing times and success rates
- **Category Usage**: Analyze which categories are used most
- **Vendor Patterns**: Identify vendor-specific patterns

## **📚 API Reference**

### **Request Headers**
```bash
Content-Type: application/json
x-api-key: your-api-key (if enabled)
```

### **Response Format**
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {...},
  "nextSteps": [...],
  "timestamp": "2025-08-21T20:00:00.000Z"
}
```

### **Error Response**
```json
{
  "error": "Error description",
  "details": "Detailed error message",
  "errorId": "unique-error-id",
  "timestamp": "2025-08-21T20:00:00.000Z"
}
```

## **🎉 Success Metrics**

### **Integration Success Indicators**
- ✅ **Categories Synced**: QuickBooks categories successfully imported
- ✅ **Line Items Mapped**: All line items have QuickBooks categories
- ✅ **Bills Created**: QuickBooks bills created automatically on approval
- ✅ **PDFs Attached**: Original invoices attached to QuickBooks bills
- ✅ **Status Tracking**: Complete visibility from PCS AI to QuickBooks

### **Performance Metrics**
- **Processing Time**: < 5 seconds for invoice processing
- **Category Accuracy**: > 90% automatic category mapping
- **Bill Creation**: < 10 seconds for QuickBooks bill creation
- **PDF Attachment**: < 15 seconds for PDF attachment

---

**🚀 Your PCS AI system is now fully integrated with QuickBooks!** 

The integration provides:
- **Automatic category mapping** for all line items
- **Seamless bill creation** when invoices are approved
- **Complete audit trail** from PCS AI to QuickBooks
- **Professional workflow** for invoice processing

Start testing with the enhanced endpoints and watch your invoices flow automatically from PCS AI to QuickBooks! 🎯
