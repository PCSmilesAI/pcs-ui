# entire file content 
from pydantic import BaseSettings
import os
from dotenv import load_dotenv

class Settings(BaseSettings):
    qbo_client_id: str
    qbo_client_secret: str
    qbo_redirect_uri: str
    qbo_scopes: str = "com.intuit.quickbooks.accounting"
    
    class Config:
        env_file = ".env"
load_dotenv()  # Load .env file if it exists
