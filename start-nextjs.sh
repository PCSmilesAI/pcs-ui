#!/bin/bash

echo "🚀 Starting Next.js Development Server for PCS UI"
echo "=================================================="

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found. Creating template..."
    cat > .env.local << EOF
# QuickBooks Online Configuration
QBO_CLIENT_ID=your_client_id_here
QBO_CLIENT_SECRET=your_client_secret_here
QBO_REDIRECT_URI=http://localhost:3000/api/qbo/callback
QBO_SCOPES=com.intuit.quickbooks.accounting
QBO_ENCRYPTION_KEY=your-32-character-secret-key-here!

# Environment
NODE_ENV=development
EOF
    echo "✅ Created .env.local template. Please update with your actual values."
fi

echo "🌐 Starting Next.js development server..."
echo "📱 Open http://localhost:3000 in your browser"
echo "🔧 QBO Test page: http://localhost:3000/qbo-test"
echo "🧪 API Test: http://localhost:3000/api/test"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
