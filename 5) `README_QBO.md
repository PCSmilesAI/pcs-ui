# QuickBooks Online OAuth2 Setup

## Steps to setup:

1. Install the required dependencies by running:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the FastAPI app with uvicorn:
   ```bash
   uvicorn src.main:app --reload --port 8000
   ```
3. Open your browser and go to `http://localhost:8000/qbo/auth` to start the OAuth flow.
4. After you authorize the app, you will be redirected to a callback URL with a code in the query parameters. You need to exchange this code for tokens by making a GET request to `/qbo/callback?code=<code>&realmId=<realmId>`.
5. Once you have the tokens, they can be used to call the CompanyInfo endpoint at `/qbo/company`.
