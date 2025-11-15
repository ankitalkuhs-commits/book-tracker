# Google OAuth Setup Guide

## Steps to Get Google Client ID:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create a New Project** (or select existing)
   - Click "Select a Project" → "New Project"
   - Name: "BookPulse" (or any name)
   - Click "Create"

3. **Enable Google+ API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "+ CREATE CREDENTIALS" → "OAuth client ID"
   - Choose "Web application"
   - Name: "BookPulse Web Client"
   
5. **Configure Authorized Origins**
   Add these URLs:
   ```
   http://localhost:5173
   http://localhost:3000
   https://your-production-domain.com
   ```

6. **Get Your Client ID**
   - After creating, copy the "Client ID"
   - It looks like: `123456789-abc123def456.apps.googleusercontent.com`

7. **Update Your .env File**
   ```bash
   cd book-tracker-frontend
   cp .env.example .env
   ```
   
   Edit `.env` and add:
   ```
   VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
   ```

8. **Restart Dev Server**
   ```bash
   npm run dev
   ```

## Testing:

1. Go to `http://localhost:5173/login` or `/signup`
2. Click "Sign in with Google" button
3. Choose your Google account
4. You should be logged in automatically!

## Notes:

- For production, add your production domain to Authorized Origins
- The Client ID is safe to expose in frontend code
- The backend verifies the token's authenticity
