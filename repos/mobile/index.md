---
repo: mobile
path: book-tracker-mobile-stitch/
purpose: Android app (Play Store: TrackMyRead)
tech: Expo SDK 54, React Native 0.81, React Navigation 7, axios, expo-notifications, react-native-svg 15.15.4 (pinned)
deploy: EAS build via .github/workflows/build-stitch-{apk,aab}.yml (manual dispatch); version + versionCode in app.json (2.2.1 / 60)
last_verified: 2026-09-12
---

## Entry Points
| File | Purpose |
|---|---|
| App.js | Font load, auth check, `preloadData()` (9 parallel requests → PreloadContext), unread polling, push registration, AppTour |
| src/navigation/AppNavigator.js | Bottom tabs (Home/Library/Circles/Insights) + root stack (Profile, Settings, Notifications, UserProfile) |
| src/services/api.js | axios → Render, 30s timeout, bt_token from AsyncStorage, 401 clears token |
| src/services/NotificationService.js | Expo push token registration (own fetch, not api.js) |
| src/screens/*.js | One file per screen |
| src/theme.js | Design tokens (primary #00464a, surface #fbf9f4) |

## Health (2026-09-12)
- Unused api.js methods: `booksAPI.getAll`, `getGoogleBookDetails`, `userbooksAPI.addBook`, `finishBook`, `notesAPI.getFriendsFeed`, `userAPI.getUser` (no such route), `getFollowing`, `registerPushToken`, `groupsAPI.getMyInvites`
- Parity gaps vs web: no Friends feed tab, no curator-invites list (see dependency-map.md)
- `_silentCoverFix()` runs on every launch
