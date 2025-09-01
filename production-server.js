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
