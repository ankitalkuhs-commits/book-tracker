# Google OAuth Setup for Mobile App

## 🚨 PLAY STORE FIX - DEVELOPER_ERROR

If you're getting `DEVELOPER_ERROR` on Play Store builds, **see [PLAYSTORE_FIX.md](PLAYSTORE_FIX.md)** for the complete solution.

**Quick Summary**: You need to:
1. Get SHA-1 from Play Console
2. Create Android OAuth client in Google Cloud Console
3. Add `androidClientId` to LoginScreen.js
4. Rebuild and upload

---

## Development Setup (Expo Go)

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
4. Click on your Web client ID
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

---

## Production Builds (Play Store / App Store)

### For Android (Play Store)

**⚠️ CRITICAL**: Production Android builds REQUIRE an Android OAuth Client ID

See **[PLAYSTORE_FIX.md](PLAYSTORE_FIX.md)** for complete step-by-step instructions.

**Summary**:
1. Get SHA-1 from Play Console → App Signing
2. Create Android OAuth client in Google Cloud Console
   - Package: `com.bookpulse.mobile`
   - SHA-1: From Play Console
3. Add to LoginScreen.js:
   ```javascript
   GoogleSignin.configure({
     webClientId: '...',
     androidClientId: 'YOUR_ANDROID_CLIENT_ID', // ADD THIS
     offlineAccess: false,
   });
   ```
4. Rebuild with `eas build --platform android --profile production`

### For iOS (App Store)

1. Create iOS OAuth client in Google Cloud Console
2. Add to LoginScreen.js:
   ```javascript
   GoogleSignin.configure({
     webClientId: '...',
     iosClientId: 'YOUR_IOS_CLIENT_ID', // ADD THIS
     offlineAccess: false,
   });
   ```
3. Rebuild with `eas build --platform ios --profile production`

---

## Current Setup

### Development (Expo Go)
- ✅ Web client ID: `580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com`
- ✅ Package: `com.bookpulse.mobile`
- ✅ Backend: `https://book-tracker-backend-0hiz.onrender.com/auth/google`

### Production (Play Store)
- ❌ Android Client ID: **REQUIRED** - see PLAYSTORE_FIX.md
- ❌ SHA-1 Certificate: **REQUIRED** - get from Play Console

### Production (App Store)
- ❌ iOS Client ID: Not yet configured

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **DEVELOPER_ERROR** on Play Store | See [PLAYSTORE_FIX.md](PLAYSTORE_FIX.md) - need Android Client ID |
| **400 Error** in Expo Go | Add Expo redirect URI to Google Cloud Console |
| **No response** | Check internet connection |
| **Token invalid** | Check backend /auth/google endpoint |
| **Works in Expo Go, fails in Play Store** | Production needs platform-specific client IDs |

---

## Quick Links

- 📱 [Play Store Fix Guide](PLAYSTORE_FIX.md)
- 🔑 [Google Cloud Console](https://console.cloud.google.com/)
- 📦 [Play Console](https://play.google.com/console/)
- 📚 [React Native Google Sign-In Docs](https://react-native-google-signin.github.io/docs/)
