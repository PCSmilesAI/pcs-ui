from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from src.qbo.qbo_client import QBOClient

router = APIRouter(prefix="/qbo", tags=["qbo"])

@router.get("/auth")
def qbo_auth():
    try:
        return RedirectResponse(QBOClient().authorization_url())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to build auth URL: {e}")

@router.get("/callback")
def qbo_callback(code: str | None = None, realmId: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(status_code=400, detail=f"Intuit error: {error}")
    if not code or not realmId:
        raise HTTPException(status_code=400, detail="Missing code or realmId")
    try:
        QBOClient().exchange_code(code, realmId)
        return JSONResponse({"status": "ok", "realm_id": realmId})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {e}")

@router.get("/company")
def qbo_company():
    try:
        return QBOClient().get_company_info()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
