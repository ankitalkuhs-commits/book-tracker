# Book Tracker — README

> 👋 Hi! This README shows how to run the Book Tracker POC on Windows, step-by-step (simple, like explaining to a kid).
> Save this file in the project root (`book-tracker/README.md`).

---

## Quick overview (what is where)
- `app/` — Python FastAPI server (backend)
- `book_tracker.db` — SQLite database file (local data)
- `book-tracker-frontend/` — React + Vite UI (frontend)
- `src/services/api.js` (frontend) — where the frontend calls the backend (change backend URL here)

---

## 1) Backend — start (Windows PowerShell)
1. Open **PowerShell** and go to project folder:
   ```powershell
   cd C:\Users\sonal\Documents\projects\book-tracker
Create & activate Python venv (if not already):

powershell
Copy code
python -m venv venv
.\venv\Scripts\Activate.ps1
Install requirements (if you have requirements.txt):

powershell
Copy code
pip install -r requirements.txt
Or install packages manually:

powershell
Copy code
pip install fastapi uvicorn[standard] sqlmodel passlib[bcrypt] python-jose[cryptography] python-multipart pydantic
(Optional) Set environment variables:

powershell
Copy code
$env:BOOK_TRACKER_DB = "C:\Users\sonal\Documents\projects\book-tracker\book_tracker.db"
$env:SECRET_KEY = "a-strong-secret-you-should-change"
Run the server from the project root:

powershell
Copy code
uvicorn app.main:app --reload
Important: run that command from the project root so Python can import the app package.

Open http://127.0.0.1:8000/docs to see the API docs (Swagger).