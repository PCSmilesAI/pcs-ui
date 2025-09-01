from fastapi import FastAPI
from src.qbo.routes import router as qbo_router
app = FastAPI(title="PCSAI")
app.include_router(qbo_router)
@app.get("/")
def root():
    return {"ok": True}
