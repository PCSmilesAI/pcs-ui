from __future__ import annotations
import base64, json, time
from pathlib import Path
from typing import Dict, Optional
import requests
from src.core.settings import Settings

TOKENS_PATH = Path(".secrets/qbo_tokens.json")
AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"

def _b64(client_id: str, client_secret: str) -> str:
    return base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

class QBOClient:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or Settings()
        TOKENS_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.realm_id: Optional[str] = None
        tok = self._load_tokens()
        if tok: self.realm_id = tok.get("realm_id")

    def _load_tokens(self) -> Optional[Dict]:
        return json.loads(TOKENS_PATH.read_text()) if TOKENS_PATH.exists() else None

    def _save_tokens(self, data: Dict, realm_id: str):
        TOKENS_PATH.write_text(json.dumps({
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": int(time.time()) + int(data.get("expires_in", 3600)) - 60,
            "realm_id": realm_id
        }, indent=2))
        self.realm_id = realm_id

    def authorization_url(self) -> str:
        from urllib.parse import urlencode, quote
        q = {
            "client_id": self.settings.QBO_CLIENT_ID,
            "response_type": "code",
            "scope": self.settings.QBO_SCOPES,
            "redirect_uri": self.settings.QBO_REDIRECT_URI,
            "state": "pcsaistate"
        }
        return f"{AUTH_URL}?{urlencode(q, quote_via=quote)}"

    def exchange_code(self, code: str, realm_id: str):
        headers = {
            "Authorization": f"Basic {_b64(self.settings.QBO_CLIENT_ID, self.settings.QBO_CLIENT_SECRET)}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        data = {"grant_type": "authorization_code","code": code,"redirect_uri": self.settings.QBO_REDIRECT_URI}
        r = requests.post(TOKEN_URL, headers=headers, data=data, timeout=30)
        if not r.ok: raise RuntimeError(f"Token exchange failed: {r.status_code} {r.text}")
        self._save_tokens(r.json(), realm_id)

    def _refresh_if_needed(self):
        tok = self._load_tokens()
        if not tok or tok["expires_at"] > int(time.time()) + 300: return
        headers = {
            "Authorization": f"Basic {_b64(self.settings.QBO_CLIENT_ID, self.settings.QBO_CLIENT_SECRET)}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        data = {"grant_type": "refresh_token","refresh_token": tok["refresh_token"]}
        r = requests.post(TOKEN_URL, headers=headers, data=data, timeout=30)
        if not r.ok: raise RuntimeError(f"Refresh failed: {r.status_code} {r.text}")
        self._save_tokens(r.json(), tok["realm_id"])

    def get_company_info(self) -> Dict:
        tok = self._load_tokens()
        if not tok: raise RuntimeError("Not authorized; visit /qbo/auth first")
        self._refresh_if_needed(); tok = self._load_tokens()
        base = "https://sandbox-quickbooks.api.intuit.com" if self.settings.QBO_ENV == "sandbox" else "https://quickbooks.api.intuit.com"
        url = f"{base}/v3/company/{tok['realm_id']}/companyinfo/{tok['realm_id']}?minorversion=73"
        r = requests.get(url, headers={"Authorization": f"Bearer {tok['access_token']}", "Accept": "application/json"}, timeout=30)
        if not r.ok: raise RuntimeError(f"CompanyInfo failed: {r.status_code} {r.text}")
        return r.json()
