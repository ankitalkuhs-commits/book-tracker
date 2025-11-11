# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from .database import init_db
from .routers import auth_router, books_router, userbooks_router, notes_router, follow_router, profile_router, googlebooks_router, likes_comments, users_router
import os
# ---------------------
# Step 1: define FastAPI app with security scheme for Swagger
# ---------------------
app = FastAPI(
    title="Book Tracker API",
    description="A simple API for tracking and sharing book reading progress.",
    version="1.0.0",
    openapi_tags=[
        {"name": "auth", "description": "Signup and login"},
        {"name": "books", "description": "Book library and details"},
        {"name": "userbooks", "description": "Track user's reading status"},
        {"name": "notes", "description": "User notes and highlights"},
        {"name": "follow", "description": "Follow users and view feeds"},
    ],
)

# Step 2: Enable Swagger's Authorize button for JWT
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# ---------------------
# Step 3: Allow CORS (so frontends can talk to it)
# ---------------------
# Read comma-separated origins from env var (set this in Render)
cors_env = os.getenv("CORS_ORIGINS", "")
if cors_env:
    # split by comma and strip whitespace
    origins = [o.strip() for o in cors_env.split(",") if o.strip()]
else:
    # fallback during local dev
    origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
    ]

app.add_middleware(
    CORSMiddleware,
    #allow_origins=origins,   # explicit list is safer than "*"
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------
# Step 4: Register all routers
# ---------------------
app.include_router(auth_router.router)
app.include_router(books_router.router)
app.include_router(userbooks_router.router)
app.include_router(notes_router.router)
app.include_router(follow_router.router)
app.include_router(profile_router.router)
app.include_router(googlebooks_router.router)
app.include_router(likes_comments.router)
app.include_router(users_router.router)

# ---------------------
# Step 4.5: Mount static files for uploads
# ---------------------
# Create uploads directory if it doesn't exist
uploads_path = Path("uploads")
uploads_path.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ---------------------
# Step 5: Initialize DB on startup
# ---------------------
@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/")
def root():
    return {"message": "Book Tracker API is running!"}


# Add this to app/main.py (anywhere at module level, after app declaration and routers)
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    # Define a bearer auth scheme named "BearerAuth"
    openapi_schema.setdefault("components", {}).setdefault("securitySchemes", {})[
        "BearerAuth"
    ] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }
    # Optionally make auth required globally in the UI (Swagger will still allow unauth endpoints)
    # If you don't want global requirement, you can remove the next line.
    openapi_schema.setdefault("security", []).append({"BearerAuth": []})

    app.openapi_schema = openapi_schema
    return app.openapi_schema

# Assign our custom OpenAPI builder
app.openapi = custom_openapi
