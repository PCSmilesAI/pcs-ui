#!/bin/bash

# Update Vercel environment variable to use www version
echo "Updating Vercel environment variable..."

# Update the redirect URI to use www version
vercel env add QBO_REDIRECT_URI production
# When prompted, enter: https://www.pcsmilesai.com/api/qbo/callback

echo "Environment variable updated!"
echo "New redirect URI: https://www.pcsmilesai.com/api/qbo/callback"
echo ""
echo "IMPORTANT: You also need to add this redirect URI to your QuickBooks app:"
echo "1. Go to https://developer.intuit.com/app/developer/myapps"
echo "2. Select your app → Keys tab"
echo "3. Add to Production Redirect URIs: https://www.pcsmilesai.com/api/qbo/callback"
echo ""
echo "Or add BOTH redirect URIs to be safe:"
echo "- https://pcsmilesai.com/api/qbo/callback"
echo "- https://www.pcsmilesai.com/api/qbo/callback"
