# Google OAuth Setup for Mobile App

## Quick Fix for Current 400 Error

The app is currently showing a 400 error because the Google OAuth redirect URI is not configured. Here's how to fix it:

### 1. Get Your Expo Redirect URI

Run this command to see your redirect URI:
```bash
cd book-tracker-mobile
npx expo start
```

Look for output like:
```
Scheme: exp://192.168.x.x:8081
```

Your redirect URI format will be: `https://auth.expo.io/@anonymous/book-tracker-mobile`

OR check app.json for your slug and use: `https://auth.expo.io/@YOUR-EXPO-USERNAME/book-tracker-mobile`

### 2. Add Redirect URI to Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Click on your Web client ID: `278815533717-2kjgpkddo1dujt8cguf0q3ib8lrka9ra`
5. Under **Authorized redirect URIs**, click **ADD URI**
6. Add these URIs:
   ```
   https://auth.expo.io/@anonymous/book-tracker-mobile
   https://auth.expo.io/@YOUR-USERNAME/book-tracker-mobile
   ```
7. Click **SAVE**

### 3. Test Again

1. Reload the app in Expo Go
2. Tap "Sign in with Google"
3. Should now work without 400 error!

## For Production Builds

When building standalone apps (not using Expo Go), you'll need:

1. **iOS Client ID** (from Google Cloud Console)
2. **Android Client ID** (from Google Cloud Console)
3. Update [LoginScreen.js](src/screens/LoginScreen.js) lines 24-26 with these IDs

## Current Setup (Development)

✅ Uses web client ID: `278815533717-2kjgpkddo1dujt8cguf0q3ib8lrka9ra`
✅ Works with Expo Go for testing
⚠️ **Needs redirect URI added to Google Cloud Console**

## Troubleshooting

**400 Error** → Add Expo redirect URI to Google Cloud Console (see step 2 above)

**No response** → Check internet connection

**Token invalid** → Backend /auth/google endpoint issue (check backend logs)

---

**IMPORTANT**: The web client ID is already in the code. You just need to add the redirect URI to Google Cloud Console!
