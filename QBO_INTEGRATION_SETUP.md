# QuickBooks Online Integration Setup

## Overview
This integration provides three main features:
1. **Automatic Bill Creation**: When an invoice is approved in PCS AI, a new Bill is automatically created in QuickBooks Online
2. **Dental Category Mapping**: Line items are intelligently categorized based on dental terminology
3. **PDF Attachment**: The original invoice PDF is automatically attached to the QuickBooks Bill

## Setup Instructions

### 1. Environment Variables
Create a `.env.local` file in the root directory with the following variables:

```env
# QuickBooks Online Configuration
QBO_CLIENT_ID=your_client_id_here
QBO_CLIENT_SECRET=your_client_secret_here
QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
QBO_SCOPES=com.intuit.quickbooks.accounting
QBO_ENCRYPTION_KEY=your-32-character-secret-key-here!

# Environment
NODE_ENV=development
```

### 2. QuickBooks App Setup
1. Go to [QuickBooks Developer Dashboard](https://developer.intuit.com/)
2. Create a new app or use existing app
3. Add the redirect URI: `http://localhost:3000/api/qbo/callback`
4. Copy the Client ID and Client Secret to your `.env.local` file

### 3. Database Setup
The integration uses SQLite to store encrypted tokens. The database will be created automatically at:
- `pcs_ai_data/qbo_tokens.db`

### 4. Testing the Integration

#### Test Connection
Visit: `http://localhost:3000/qbo-test`

This page will:
- Show connection status
- Display captured tokens (realmId, access token, refresh token)
- Allow you to test bill creation

#### Connect to QuickBooks
1. Click "Connect to QuickBooks" on the test page
2. Authorize the app in QuickBooks
3. You'll be redirected back with tokens stored securely

#### Test Bill Creation
1. Go to any invoice in PCS AI
2. Click "Approve"
3. The system will automatically:
   - Create a Bill in QuickBooks
   - Map line items to dental categories
   - Attach the PDF (when implemented)

## API Endpoints

### Authentication
- `GET /api/qbo/auth` - Start OAuth flow
- `GET /api/qbo/callback` - OAuth callback (handles token storage)

### Bill Management
- `POST /api/qbo/create-bill` - Create a bill manually
- `POST /api/qbo/auto-create-bill` - Auto-create bill for approved invoice
- `GET /api/qbo/status` - Check connection status

## Dental Category Mapping

The system automatically categorizes line items based on keywords:

- **Supplies**: supply, material, consumable
- **Dental Supplies**: dental, tooth, oral, mouth
- **Instruments**: instrument, tool, drill, scalpel
- **Equipment**: equipment, machine, device, unit
- **Lab Work**: lab, crown, bridge, implant, denture
- **Services**: cleaning, filling, extraction, orthodontic
- **Medications**: anesthesia, medication, drug, prescription

## Security Features

- **Token Encryption**: All tokens are encrypted before storage
- **Automatic Refresh**: Access tokens are automatically refreshed when expired
- **Secure Storage**: Tokens stored in encrypted SQLite database

## Troubleshooting

### Common Issues

1. **"No QuickBooks tokens found"**
   - Make sure you've completed the OAuth flow
   - Check that the callback URL is correct

2. **"Connection failed"**
   - Verify your Client ID and Secret are correct
   - Check that the app is approved in QuickBooks

3. **"Bill creation failed"**
   - Ensure you have the correct permissions in QuickBooks
   - Check that vendor exists in QuickBooks

### Debug Mode
Enable debug logging by setting `NODE_ENV=development` in your environment.

## Next Steps

1. Set up your environment variables
2. Test the connection at `/qbo-test`
3. Approve an invoice to test automatic bill creation
4. Customize the dental category mapping as needed
