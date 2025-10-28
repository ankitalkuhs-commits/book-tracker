@echo off
title Book Tracker - Setup Checker (Auto Fix)
echo.
echo ============================================
echo   📘 BOOK TRACKER - FASTAPI SETUP CHECKER
echo ============================================
echo.

:: Step 1 - Activate virtual environment if present
echo Activating virtual environment (if exists)...
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
    echo ✅ Virtual environment activated.
) else (
    echo ⚠️  No virtual environment found. Creating one...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo ✅ Virtual environment created and activated.
)
echo.

:: Step 2 - Check Python installation
echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python not found. Please install Python 3.10+ and add it to PATH.
    pause
    exit /b
) else (
    python --version
)
echo.

:: Step 3 - Check pip
echo Checking pip...
pip --version >nul 2>&1
if errorlevel 1 (
    echo ❌ pip not found! Please reinstall Python with pip.
    pause
    exit /b
) else (
    pip --version
)
echo.

:: Step 4 - Install missing packages automatically
echo Checking required Python packages...
set PACKAGES=fastapi uvicorn sqlmodel passlib python-jose python-multipart pydantic
for %%p in (%PACKAGES%) do (
    pip show %%p >nul 2>&1
    if errorlevel 1 (
        echo 🚧 Installing missing package: %%p ...
        pip install %%p >nul 2>&1
        if errorlevel 1 (
            echo ❌ Failed to install %%p
        ) else (
            echo ✅ Installed %%p
        )
    ) else (
        echo ✅ %%p already installed
    )
)
echo.

:: Step 5 - Check uvicorn
echo Checking uvicorn version...
uvicorn --version >nul 2>&1
if errorlevel 1 (
    echo ❌ uvicorn not found, installing now...
    pip install uvicorn[standard]
) else (
    uvicorn --version
)
echo.

:: Step 6 - Verify project files
echo Checking for project files...
set FILES=app\main.py app\database.py app\models.py app\auth.py app\crud.py app\deps.py app\routers\auth_router.py app\routers\books_router.py app\routers\userbooks_router.py app\routers\notes_router.py requirements.txt
for %%f in (%FILES%) do (
    if exist "%%f" (
        echo ✅ %%f found
    ) else (
        echo ⚠️  Missing file: %%f
    )
)
echo.

:: Step 7 - Final summary
echo ============================================
echo   ✅ Setup check complete!
echo --------------------------------------------
echo If you saw any ⚠️  or ❌ lines above:
echo - Fix missing files (create or copy them)
echo - Rerun this script after fixing
echo.
echo You can now run your app with:
echo    uvicorn app.main:app --reload
echo and open http://127.0.0.1:8000/docs
echo ============================================
echo.
pause
