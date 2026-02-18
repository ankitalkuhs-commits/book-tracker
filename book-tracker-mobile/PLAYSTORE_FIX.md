# Fix Google Sign-In for Play Store Build

## Problem
`DEVELOPER_ERROR` when signing in with Google on Play Store version. This happens because production Android builds need an Android OAuth Client ID tied to your app's SHA-1 certificate.

## Solution (Follow these steps in order)

### Step 1: Get Your App's SHA-1 Certificate Fingerprint

You have 2 options:

#### Option A: From Google Play Console (Recommended for Play Store builds)
1. Go to [Google Play Console](https://play.google.com/console/)
2. Select your app **TrackMyRead**
3. Navigate to **Release** → **Setup** → **App Signing**
4. Copy the **SHA-1 certificate fingerprint** under "App signing key certificate"
   - Example: `AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE`

#### Option B: From Your Keystore (If you built locally)
```bash
keytool -list -v -keystore YOUR_KEYSTORE_FILE.jks -alias YOUR_KEY_ALIAS
```
Copy the SHA-1 value.

### Step 2: Create Android OAuth Client in Google Cloud Console

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your project
3. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
4. Choose **Android** as application type
5. Fill in:
   - **Name**: `TrackMyRead Android`
   - **Package name**: `com.bookpulse.mobile` (MUST match exactly)
   - **SHA-1 certificate fingerprint**: Paste the SHA-1 from Step 1
6. Click **CREATE**
7. **Copy the Client ID** (looks like: `123456789-abcdefg.apps.googleusercontent.com`)

### Step 3: Update Mobile App Code

Replace the `webClientId` in your app with BOTH web and Android client IDs:

**File**: `src/screens/LoginScreen.js` (line 23-27)

**Replace**:
```javascript
GoogleSignin.configure({
  webClientId: '580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com',
  offlineAccess: false,
});
```

**With**:
```javascript
GoogleSignin.configure({
  webClientId: '580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com',
  androidClientId: 'YOUR_ANDROID_CLIENT_ID_HERE.apps.googleusercontent.com', // Paste from Step 2
  offlineAccess: false,
});
```

### Step 4: Rebuild and Re-upload to Play Store

```bash
cd book-tracker-mobile
eas build --platform android --profile production
```

Then upload the new AAB to Play Store.

### Step 5: Test

1. Download the app from Play Store (or internal testing track)
2. Tap "Sign in with Google"
3. Should now work without DEVELOPER_ERROR! ✅

---

## Quick Checklist

- [ ] Got SHA-1 from Play Console
- [ ] Created Android OAuth client in Google Cloud Console
- [ ] Package name is exactly `com.bookpulse.mobile`
- [ ] Added `androidClientId` to GoogleSignin.configure()
- [ ] Rebuilt app with `eas build`
- [ ] Uploaded new AAB to Play Store
- [ ] Tested on Play Store version

## Troubleshooting

**Still getting DEVELOPER_ERROR?**
- Double-check package name matches exactly: `com.bookpulse.mobile`
- Verify SHA-1 fingerprint is from the Play Console App Signing certificate
- Wait 5-10 minutes after creating OAuth client (Google needs to propagate changes)
- Make sure you rebuilt the app after adding androidClientId

**Sign-in works in Expo Go but not Play Store?**
- This is expected - Expo Go doesn't need androidClientId, but production builds do

**Multiple accounts issue?**
- The app already handles this with `await GoogleSignin.signOut()` before sign-in

---

## Current Configuration

- **Package**: `com.bookpulse.mobile`
- **Web Client ID**: `580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com` ✅
- **Android Client ID**: ❌ MISSING (add this to fix)
- **Backend**: `https://book-tracker-backend-0hiz.onrender.com/auth/google`

## Additional Resources

- [Google Sign-In Troubleshooting](https://react-native-google-signin.github.io/docs/troubleshooting)
- [SHA-1 Certificate Guide](https://developers.google.com/android/guides/client-auth)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
