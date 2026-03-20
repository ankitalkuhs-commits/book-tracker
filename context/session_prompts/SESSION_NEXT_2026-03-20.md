# Next Session Start — March 20, 2026

## What Was Accomplished This Session

### Push Notification Debugging & Fix (Mobile)
- **Root cause identified:** `google-services.json` was missing entirely from `book-tracker-mobile/` → `getExpoPushTokenAsync()` threw silently, `POST /push-tokens/` never fired
- **Root cause 2:** Race condition in `handleLoginSuccess` — `setIsLoggedIn(true)` fired before `authAPI.getToken()` resolved, so the retry `useEffect` ran with `authTokenRef.current === null`

### Files Changed
| File | Change |
|---|---|
| `book-tracker-mobile/google-services.json` | **NEW** — Firebase Android config (project: `trackmyread2504`, package: `com.bookpulse.mobile`) |
| `book-tracker-mobile/app.json` | Added `android.googleServicesFile: "./google-services.json"` |
| `book-tracker-mobile/App.js` | `authTokenRef` + `registrationInProgressRef` + `safePushRegistration()` — token-first login pattern |
| `book-tracker-mobile/src/services/NotificationService.js` | `registrationInProgress` + `lastRegisteredExpoToken` guards, full `getExpoPushTokenAsync` diagnostic logging |

### Git Status
- All changes committed: `cd96555` — "fix: wire android firebase config for push tokens"
- Pushed to remote ✅

---

## ⏳ Pending: Verify End-to-End Push

A new EAS build is needed (the last build `e0379ca2` was triggered before the firebase fix was committed).

**Build command (must run from mobile sub-directory):**
```powershell
Set-Location C:\Users\sonal\Documents\projects\book-tracker\book-tracker-mobile
eas build --platform android --profile preview
```

**After installing the APK, check Render logs for:**
```
[Push] registerExpoPushToken called, authToken present: true
[Push] Using Expo projectId: 9b559417-a211-4e49-8ef2-806f7acf9d88
[Push] About to call getExpoPushTokenAsync...
[Push] Raw result: {"data":"ExponentPushToken[...]"}
[Push] Expo token generated: ExponentPushToken[...]
[Push] Token registered with backend: ...
POST /push-tokens/ 200
```

**If `getExpoPushTokenAsync` THROWS instead**, note the error message — it will tell us exactly what's wrong with the FCM config.

---

## If Push Still Fails

1. Check `google-services.json` — ensure `package_name` = `com.bookpulse.mobile`
2. Verify FCM V1 key in Expo Dashboard: **Projects → book-tracker-mobile → Credentials → Android → FCM V1**
3. Read the `[Push] getExpoPushTokenAsync THREW` log for the exact error code

---

## Optional Next Steps

- Test broadcast push: `POST /admin/push/broadcast` (`{"title":"Test 🔔","body":"Push is working!"}`) via Swagger
- Update app icon (user asked earlier — needs 1024×1024 `icon.png`, adaptive `adaptive-icon.png`, `splash-icon.png` in `book-tracker-mobile/assets/`)

---

## Relevant Context Files
- [context/deployment/README.md](../deployment/README.md) — EAS build, FCM, push token architecture
- `book-tracker-mobile/App.js`
- `book-tracker-mobile/src/services/NotificationService.js`
- `book-tracker-mobile/app.json`
