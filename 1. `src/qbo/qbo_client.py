# entire file content 
import os
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes
from intuitlib.exceptions import BadRequestException, UnauthorizedException
from .settings import Settings

class QBOClient:
    def __init__(self):
        self._auth_client = None
        self._settings = Settings()
        self._load_tokens()

    def _load_tokens(self):
        # Load tokens from environment variables or .env file
        access_token = os.getenv('QBO_ACCESS_TOKEN')
        refresh_token = os.getenv('QBO_REFRESH_TOKEN')
        expires_at = os.getenv('QBO_EXPIRES_AT')
        realm_id = os.getenv('QBO_REALM_ID')
        
        if not access_token or not refresh_token or not expires_at or not realm_id:
            raise ValueError("Missing required tokens")

        self._auth_client = AuthClient(self._settings.qbo_client_id, 
                                       self._settings.qbo_client_secret, 
                                       access_token=access_token, 
                                       refresh_token=refresh_token, 
                                       expires_at=expires_at, 
                                       realm_id=realm_id)

    def company(self):
        try:
            response = self._auth_client.get('v3/company')
            return response.json()
        except (BadRequestException, UnauthorizedException) as e:
            # Handle exceptions here
            pass
