#!/bin/bash

echo "🔄 Restarting PCS AI Next.js Server..."

# Stop all PM2 processes
echo "📴 Stopping PM2 processes..."
pm2 stop all || true

# Clear Next.js build cache
echo "🗑️ Clearing Next.js build cache..."
rm -rf .next
rm -rf node_modules/.cache

# Clear PM2 logs
echo "🧹 Clearing PM2 logs..."
pm2 flush

# Start Next.js in development mode
echo "🚀 Starting Next.js development server..."
pm2 start npm --name "pcs-ai-nextjs" -- run dev

# Show status
echo "📊 PM2 Status:"
pm2 status

echo "✅ Server restart complete! Check https://pcsmilesai.com/ForMePage"
