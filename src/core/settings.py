from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    QBO_CLIENT_ID: str = ""
    QBO_CLIENT_SECRET: str = ""
    QBO_REDIRECT_URI: str = "http://localhost:8000/qbo/callback"
    QBO_SCOPES: str = "com.intuit.quickbooks.accounting"
    QBO_ENV: str = "sandbox"  # or "production"

    class Config:
        env_file = ".env"
