# Mobile Stitch — Phase 3 Parity Changelog

**Branch:** `stitch-experiment`  
**Directory:** `book-tracker-mobile-stitch/`  
**Completed:** April 23, 2026  
**Reference webapp:** `https://tracker-stitch.vercel.app`

This document is the single source of truth for every change made during the screen-by-screen webapp parity pass. Use it to quickly find what was changed per screen and spot any misses.

---

## New Files Added

| File | Purpose |
|------|---------|
| `src/components/AppHeader.js` | Shared top bar: TrackMyRead logo + bell icon (red unread badge, 9+) + avatar initials. Reads `unreadCount` from `NotificationContext`. Props: `user`, `onBellPress`, `onAvatarPress` |
| `src/context/NotificationContext.js` | React context exposing `{ unreadCount }` — provided by `App.js`, consumed by `AppHeader`. Avoids prop drilling unread count through every screen |

---

## Infrastructure Changes

### `App.js`
- Added `NotificationContext` import
- Wrapped entire app in `<NotificationContext.Provider value={{ unreadCount }}>` so AppHeader can read it from any screen
- Removed `unreadCount` prop from `AppNavigator` (no longer needed)

### `src/navigation/AppNavigator.js` — **Full rewrite**
- **Before:** 6 tabs including Notifications + Profile as tabs
- **After:** 4 tabs only: Home, Library, Circles, Insights
- Notifications + Profile moved to **root Stack** (pushed screens, accessed via AppHeader bell/avatar)
- `ProfileStack` (own profile) lives at root level → contains: `ProfileRoot`, `Settings`, `UserProfile`, `BookDetail`
- `FeedStack` → `Feed`, `UserProfile`
- `LibraryStack` → `Library`, `BookDetail`
- `GroupsStack` → `Groups`, `GroupDetail`, `UserProfile`
- `InsightsStack` → `Insights`, `BookDetail`
- Root Stack → `Tabs`, `Notifications`, `Profile` (ProfileStack), `UserProfile`
- `UserProfile` in root Stack ensures `NotificationsScreen` can navigate to a user's profile after tapping a follow notification

---

## Screen-by-Screen Changes

### `src/screens/LoginScreen.js` *(updated Apr 24)*
- **Google G icon:** custom `GoogleGIcon` component — 4-colour quadrant Views clipped into a circle (blue/red/green/yellow) with white inner ring cutout + blue crossbar. No extra package needed.
- **Hero image:** height 220 → 260px
- **Quote overlay:** repositioned to `top: 18%, right: 14` (centre-right); background opacity 0.65 → 0.93 (solid cream); decorative `"` text (36px, gray) replaces `MaterialCommunityIcons format-quote-open`; subtle elevation shadow added
- **"Track your reading." color:** `colors.onSurface` (near-black) → `colors.primary` (teal); font size 22 → 28
- **"Share your journey." font size:** 22 → 28 (matched)
- **Marquee strip** at bottom (outside ScrollView, sticks to bottom): infinite left-scroll of 7 feature one-liners separated by `·`; uses `Animated.loop` + `Easing.linear` + `useNativeDriver: true`
- Logo icon: `Ionicons book` → `MaterialCommunityIcons book-open-variant`
- Removed empty `bottomPad` view

*(Previous changes still apply — see below)*

- Button copy: "Continue with Google" → "Sign in with Google"
- Button icon: custom white bubble G → `MaterialCommunityIcons` `google` icon
- Social proof avatars: colorful A/B/C → neutral gray initials
- Quote card: hardcoded `"` character → decorative `format-quote-open` icon in `colors.secondary`
- Tagline "Share your journey." color: `colors.primary` (teal) → `colors.secondary` (golden)
- Tagline: single line → two lines (split with `\n`)
- Added subtitle: "The social home for book lovers..."
- Removed community feed section (post-login content was leaking onto the auth screen)

---

### `src/screens/FeedScreen.js`
- **Composer:** FAB + full-screen modal → inline card composer at top of feed
- Composer fields added: "Tag a book (optional)", "Add a striking quote", "Current mood or emotion..."
- Submit: "Post" → "Post Reflection"
- **"For You" shelf:** horizontal scroll shelf of recommended books with reason labels — calls `booksAPI.getRecommendations()`
- Post like icon: custom emoji → `Ionicons heart` / `heart-outline`
- Post: comment count bubble added (chatbubble-outline icon)
- Post: book title label shown above author when post has a book tagged
- Post delete: 🗑️ emoji button → `···` menu dropdown (owner/admin only)
- Tab label: "Your Friends" → "Friends"
- `AppHeader` added at top with `onBellPress → navigate('Notifications')` and `onAvatarPress → navigate('Profile')`
- **Navigation:** Post author row (`userInfo`) wrapped in `TouchableOpacity` → `navigate('UserProfile', { userId: post.user.id })`
- Removed old hardcoded `paddingTop: 50` / StatusBar handling

---

### `src/screens/LibraryScreen.js`
- Title: "My Library" → "Your Library" (dark color, not teal)
- Added subtitle: "Curating your personal journey through words and wisdom."
- Tab / search order: Search was above tabs → Tabs now above Search
- Tab pills: no border (invisible on cream bg) → added `borderWidth: 1, borderColor: colors.outlineVariant`
- Tab: removed book counts from pill labels
- Spine thickness: `SPINE_W = 9` → `SPINE_W = 5` (matches webapp slimmer spines)
- "Done" status badge → "Finished"
- Status text added below author in library grid cards: "WANT TO READ" / "READING" / "FINISHED" (small-caps)
- **Add Book Modal — Search panel:** cream background, result cards (white + shadow + rounded corners), covers 72×108px (was 48×72), publisher line shown, divider lines removed
- **Add Book Modal — Options panel:** cover 110×165px (was 60×90), description added (up to 5 lines), publisher / year / pages metadata shown
- `AppHeader` added with bell + avatar; removed old `StatusBar` + `useSafeAreaInsets` manual padding

---

### `src/screens/GroupsScreen.js`
- `AppHeader` added (bell → Notifications, avatar → Profile)
- Removed `StatusBar` import and manual `useSafeAreaInsets` top padding

---

### `src/screens/GroupDetailScreen.js`
- **Hero card:** dark teal background (`colors.primary`)
- **Back button:** `backgroundColor: 'rgba(255,255,255,0.15)'` (was gray `surfaceContainerHigh` — clashed with dark teal hero)
- **StyleSheet completed:** Added all missing styles that JSX referenced but weren't defined: `hero`, `heroPill`, `backBtn`, `leaderReading`, `memberNameRow`, `memberUsername`, `textLink`, `removeLink`, `goalPages`, `goalOf`, `goalTrack`, `goalFill`, `goalPct`, `inviteLinkRow`, `inviteLinkText`, `copyBtn`, `searchWrap`, `disbandBtn`, `disbandText`
- **Leaderboard rows:** `<View>` → `<TouchableOpacity onPress={() => navigate('UserProfile', { userId: entry.user_id })}>`
- **Member rows:** `<View>` → `<TouchableOpacity onPress={() => navigate('UserProfile', { userId: m.user_id })}>`

---

### `src/screens/InsightsScreen.js` — **Full rewrite**
- Added `profileAPI` import + `user` state (fetched via `profileAPI.getMe()`)
- `AppHeader` added with bell + avatar; `useSafeAreaInsets` removed (AppHeader handles safe area)
- **Stat cards redesign:** label (small-caps, 10px, golden) at top + value (32px bold) large + optional sub-text below
- Added "THIS YEAR" stat card (books finished this year)
- Added "CURRENTLY READING" stat card (full-width)
- **Streak section redesign:** `streakRow` with two halves and a vertical divider — left half = current streak with 🔥, right half = longest streak
- **Goal section redesign:** `goalHeader` row with "On track" green badge (or "Behind" red), `goalBody` with circular ring on left + text on right
- **Projected finishes:** each book is its own card (`projRow`) with date pill on right + "X days left" sub-text
- `StatCard` component: new `sub` prop, `statCardTop` row layout for label

---

### `src/screens/SettingsScreen.js` — **Full rewrite**
- **Header:** removed eyebrow label; now just back arrow + "Settings" title in `topBar`
- `useSafeAreaInsets` for `topBar` `paddingTop`
- **Profile hero:** 72px circular avatar (`avatarImg`) with name + email below
- Two action buttons side-by-side: "Choose avatar" (`happy-outline` icon) + "Upload photo" (`cloud-upload-outline` icon)
- **Avatar picker modal (`AvatarPickerModal`):**
  - 12 DiceBear `adventurer` seeds: `['Aneka','Buster','Callie','Destiny','Emery','Felix','Gracie','Harley','Iris','Jasper','Kali','Lexi']`
  - Each seed has a unique background color
  - `FlatList numColumns={4}` grid
  - Selected avatar: teal border + checkmark overlay
  - "Use This Avatar" button disabled until a selection is made
- `handleSelectAvatar`: calls `profileAPI.updateMe({ profile_picture: avatar.url })`
- Avatar URL format: `https://api.dicebear.com/9.x/adventurer/png?seed=${seed}&size=200`
- All existing settings (display name, bio, reading goal, notification prefs, privacy toggle, delete account) preserved

---

### `src/screens/BookDetailScreen.js` — **Full rewrite**
- `useSafeAreaInsets` replacing hardcoded `paddingTop: 52`
- Status options: "To Read" → "Want to Read"
- **Status pills:** segmented container style — `statusRow` has a `surfaceContainerHigh` background; pills share the container (no individual borders)
- **Star rating (`StarRating` component):** 5 tappable stars, `colors.secondary` (golden) for filled; shown **only** when `ub.status === 'finished'`
- **Progress (reading status):** `progressTopRow` with "X of Y pages" left-aligned + "3%" right-aligned; then bar; then page input + "Update" button
- **`pageAltRow`:** shown for non-reading statuses — "Currently on page… (optional)" input with hint "Used when switching to Reading"
- **Note composer:** always-visible `noteComposer` card (no toggle button) — textarea + `noteQuoteRow` with quote input + inline "Post" button
- Section label: "NOTES & REFLECTIONS"
- Empty state: "No notes yet. Write your first reflection above."
- **Remove book:** trash icon + "Remove from library" red text at bottom of screen
- Removed header trash icon (was confusing)

---

### `src/screens/UserProfileScreen.js` — **Full rewrite**
- `useSafeAreaInsets` for `topBar` `paddingTop`
- **Avatar:** `borderRadius: 14` (square with rounded corners, not circle) + teal `borderColor: colors.primary` border
- **Stats pills:** "FOLLOWERS", "FOLLOWING", "COLLECTIONS" in small-caps (`fontSize: 10, fontWeight: '700', letterSpacing: 0.8`)
- **Follow button:** `flexDirection: 'row'` with checkmark icon when already following
- **Yearly Progress section (NEW):**
  - Eyebrow: "{YEAR} PROGRESS"
  - Large number: `{goalFinished} / {goalTarget} books`
  - Thick golden progress bar (`backgroundColor: colors.secondary`)
  - Pages read sub-text below bar
- **VelocityChart redesign:**
  - Subtitle text line added
  - Toggle labels: `30D` / `90D`
  - Bar height: 48px → 72px (taller)
  - Today's bar uses `colors.secondary` (golden) instead of dark
- **"Curated Library" section:**
  - `sectionHeaderRow` with title left and "View All X Books →" right (tappable)
- **"By The Numbers" section (NEW — between Curated Library and Public Notes):**
  - 3 stat cards in a row: "In Library", "Finished", "Avg pages/day"
  - "CURRENTLY READING" block: up to 3 books, each showing cover image + title + author + thin progress bar + % text
  - "+X more" overflow text if >3 currently reading books
  - Data sourced from `userAPI.getUserStats(userId)` (same shape as InsightsScreen's activityAPI)
- **Public Notes:**
  - Date formatted as "APR 14, 2026" (small-caps month)
  - Share button (share icon) in note footer
  - Footer layout: date left / action icons right
- `fmt()` helper for large number formatting (1k+)
- `formatDate()` helper: ISO date → "MMM DD, YYYY" small-caps

---

### `src/screens/NotificationsScreen.js`
- **Back arrow added** to header (screen is now a pushed root-stack screen, no longer a tab)
- `backBtn` style added: `marginRight: 12, padding: 4`
- Header layout: back arrow → title block → "Mark all read" button
- `alignItems: 'flex-end'` → `alignItems: 'center'` on header row

---

### `src/screens/ProfileScreen.js` (own profile)
- Added `useSafeAreaInsets` import (`react-native-safe-area-context`)
- `const insets = useSafeAreaInsets()` in component body
- **Back arrow added** to `topBar` (screen is now a pushed root-stack screen)
- `topBar` `paddingTop: 56` (hardcoded) → `paddingTop: insets.top + 16` (dynamic)
- `topBar` `alignItems: 'flex-end'` → `alignItems: 'center'`
- `backBtn` style added: `marginRight: 12, padding: 4`

---

### `src/services/api.js`
- Added `booksAPI.getRecommendations()` → `GET /books/recommendations`

---

## What Was NOT Changed (intentionally)

| Screen | Reason |
|--------|--------|
| `SearchScreen.js` | Not exposed in navigation (Search is integrated into Library) |
| Backend (`app/`) | No backend changes this phase — all parity work was mobile UI only |
| Web frontend (`book-tracker-frontend-stitch/`) | No web changes this phase |

---

## Known Gaps / Things to Verify on Device

1. **UserProfile "By The Numbers"** — data shape from `userAPI.getUserStats(userId)` needs to match what InsightsScreen uses from `activityAPI`. Verify field names: `total_books`, `books_finished`, `avg_pages_per_day`.
2. **DiceBear avatar URLs** — requires internet access; test on device with connectivity.
3. **Star rating persistence** — `handleRateBook` must call correct API endpoint. Verify the rating field name matches backend (`rating` vs `star_rating`).
4. **"View All Books" on UserProfile** — `TouchableOpacity` is there but no navigation target wired yet (would need a full library list screen for other users).
5. **ProfileScreen back button** — only makes sense when navigated to from somewhere. If user lands on Profile via avatar tap from any tab, `navigation.goBack()` should work. If Profile is the deepest screen in ProfileStack, goBack returns to the previous tab. Verify this feels natural.
6. **NotificationsScreen → UserProfile** — follow event taps call `navigate('UserProfile', { userId: item.actor_id })`. This is in the root stack, so it should resolve correctly. Verify on device.
