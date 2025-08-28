# entire file content 
from fastapi import FastAPI
from .qbo import routes as qbo_routes

app = FastAPI()

app.include_router(qbo_routes.router)
