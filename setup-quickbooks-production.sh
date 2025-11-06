#!/bin/bash

echo "🚀 Setting up QuickBooks Production Integration..."

# Create production.env
echo "📝 Creating production.env..."
cat > production.env << 'EOF'
# QuickBooks Production Credentials
QB_CLIENT_ID=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
QB_CLIENT_SECRET=SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74
QB_ENVIRONMENT=production
QB_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
QB_DISCONNECT_URI=https://pcsmilesai.com/api/qbo/disconnect
QB_WEBHOOK_VERIFIER_TOKEN=webhook_token_here_if_needed

# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Domain
DOMAIN=https://pcsmilesai.com
EOF

# Install required dependencies
echo "📦 Installing dependencies..."
npm install sqlite3 intuit-oauth

# Create database.js
echo "🗄️ Creating database.js..."
cat > database.js << 'EOF'
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, 'pcs_ai_data', 'qbo_tokens.db');
const db = new sqlite3.Database(dbPath);

// Initialize database schema
db.serialize(() => {
    // Create tokens table
    db.run(`
        CREATE TABLE IF NOT EXISTS qbo_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            realm_id TEXT UNIQUE NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    // Create company info table
    db.run(`
        CREATE TABLE IF NOT EXISTS company_info (
            realm_id TEXT PRIMARY KEY,
            company_name TEXT,
            email TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);
});

// Token management functions
const tokenManager = {
    // Save or update tokens
    async saveTokens(tokens) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO qbo_tokens (realm_id, access_token, refresh_token, expires_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(realm_id) 
                DO UPDATE SET 
                    access_token = excluded.access_token,
                    refresh_token = excluded.refresh_token,
                    expires_at = excluded.expires_at,
                    updated_at = strftime('%s', 'now')
            `;
            
            db.run(query, [
                tokens.realmId,
                tokens.access_token,
                tokens.refresh_token,
                tokens.expires_at
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },

    // Get tokens by realm ID
    async getTokens(realmId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM qbo_tokens WHERE realm_id = ?',
                [realmId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },

    // Get the most recent token
    async getLatestTokens() {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1',
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },

    // Delete tokens
    async deleteTokens(realmId) {
        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM qbo_tokens WHERE realm_id = ?',
                [realmId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    },

    // Check if tokens exist
    async hasTokens() {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as count FROM qbo_tokens',
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count > 0);
                }
            );
        });
    }
};

module.exports = {
    db,
    tokenManager
};
EOF

# Create quickbooks-routes.js
echo "🔌 Creating QuickBooks routes..."
cat > quickbooks-routes.js << 'EOF'
const express = require('express');
const router = express.Router();
const OAuthClient = require('intuit-oauth');
const { tokenManager } = require('./database');

// Initialize QuickBooks client
const oauthClient = new OAuthClient({
    clientId: process.env.QB_CLIENT_ID,
    clientSecret: process.env.QB_CLIENT_SECRET,
    environment: process.env.QB_ENVIRONMENT || 'production',
    redirectUri: process.env.QB_REDIRECT_URI
});

// Start OAuth flow
router.get('/auth', (req, res) => {
    const authUri = oauthClient.authorizeUri({
        scope: [
            OAuthClient.scopes.Accounting,
            OAuthClient.scopes.OpenId,
            OAuthClient.scopes.Profile,
            OAuthClient.scopes.Email
        ],
        state: 'intuit-test'
    });
    res.redirect(authUri);
});

// OAuth callback
router.get('/callback', async (req, res) => {
    try {
        const authCode = req.query.code;
        const realmId = req.query.realmId;
        
        if (!authCode) {
            return res.status(400).send('No authorization code provided');
        }

        // Exchange auth code for tokens
        const authResponse = await oauthClient.createToken(req.url);
        
        // Store tokens in database
        const tokens = {
            access_token: authResponse.getJson().access_token,
            refresh_token: authResponse.getJson().refresh_token,
            realmId: realmId,
            expires_at: Date.now() + (authResponse.getJson().expires_in * 1000)
        };
        
        await tokenManager.saveTokens(tokens);
        
        // Redirect to success page
        res.redirect('/success.html?connected=true');
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send('Authentication failed: ' + error.message);
    }
});

// Disconnect
router.get('/disconnect', async (req, res) => {
    try {
        const tokenData = await tokenManager.getLatestTokens();
        
        if (tokenData) {
            oauthClient.setToken({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token
            });
            
            await oauthClient.revoke();
            await tokenManager.deleteTokens(tokenData.realm_id);
        }
        
        res.json({ success: true, message: 'Successfully disconnected from QuickBooks' });
    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get connection status
router.get('/status', async (req, res) => {
    try {
        const hasTokens = await tokenManager.hasTokens();
        res.json({ connected: hasTokens });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
EOF

# Create/Update production server file
echo "🖥️ Creating production-server.js..."
cat > production-server.js << 'EOF'
require('dotenv').config({ path: './production.env' });
const express = require('express');
const path = require('path');
const quickbooksRoutes = require('./quickbooks-routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// QuickBooks routes
app.use('/api/qbo', quickbooksRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', environment: process.env.NODE_ENV });
});

// Success page
app.get('/success.html', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QuickBooks Connected</title>
            <style>
                body { font-family: Arial; text-align: center; padding: 50px; }
                .success { color: green; }
                .error { color: red; }
            </style>
        </head>
        <body>
            <h1 class="success">✅ QuickBooks Connected Successfully!</h1>
            <p>You can now close this window and return to your application.</p>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`Production server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
EOF

# Create Dockerfile
echo "🐳 Creating Dockerfile..."
cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p pcs_ai_data

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "production-server.js"]
EOF

# Create docker-compose.yml
echo "🐳 Creating docker-compose.yml..."
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - production.env
    volumes:
      - ./pcs_ai_data:/app/pcs_ai_data
      - ./logs:/app/logs
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - app
    restart: unless-stopped
EOF

# Create nginx.conf
echo "🌐 Creating nginx.conf..."
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name pcsmilesai.com www.pcsmilesai.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl;
        server_name pcsmilesai.com www.pcsmilesai.com;

        ssl_certificate /etc/letsencrypt/live/pcsmilesai.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/pcsmilesai.com/privkey.pem;

        location / {
            proxy_pass http://app:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

# Create deploy.sh
echo "🚀 Creating deploy.sh..."
cat > deploy.sh << 'EOF'
#!/bin/bash

echo "Deploying PCS AI QuickBooks Integration..."

# Your email for SSL certificates
EMAIL="your-email@example.com"

# Install SSL certificate (if not already done)
if [ ! -d "/etc/letsencrypt/live/pcsmilesai.com" ]; then
    echo "Installing SSL certificate..."
    sudo certbot certonly --standalone -d pcsmilesai.com -d www.pcsmilesai.com --non-interactive --agree-tos -m $EMAIL
fi

# Build and deploy with Docker
docker-compose down
docker-compose build
docker-compose up -d

echo "Deployment complete!"
echo "Your app should be available at https://pcsmilesai.com"
echo ""
echo "Test OAuth flow: https://pcsmilesai.com/api/qbo/auth"
echo "Check status: https://pcsmilesai.com/api/qbo/status"
EOF

# Make scripts executable
chmod +x deploy.sh

# Create logs directory
mkdir -p logs
mkdir -p pcs_ai_data

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit deploy.sh and replace 'your-email@example.com' with your actual email"
echo "2. Run: npm install dotenv express"
echo "3. Deploy with: ./deploy.sh"
echo ""
echo "Test locally first with: node production-server.js"
