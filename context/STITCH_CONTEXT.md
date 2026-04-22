# Stitch Experiment — Context

## What This Is
A fully isolated UI rebuild of TrackMyRead using the Stitch MCP.
Goal: build a new polished Web UI first, then use the same design language,
component patterns, and API contracts to rebuild the Mobile app in sync.

Production app (mobile + existing web) is NEVER touched during this process.

---

## Phases

### Phase 1 — Web (Current)
Build new web frontend using Stitch. Validate against isolated backend + Supabase DB.

### Phase 2 — Mobile (After Phase 1 merged)
Rebuild the React Native mobile app to match the same design system, flows,
and API contracts established in Phase 1. Same visual language, identical API calls.

---

## Branch
`stitch-experiment`

## Stack
| Layer | Service | Notes |
|-------|---------|-------|
| Frontend | Vercel (preview URL) | Auto-deploys from stitch-experiment branch |
| Backend | New Render service | Same codebase, stitch-experiment branch |
| Database | Supabase (free tier) | Drop-in PostgreSQL, zero code changes needed |

## What Is Frozen (Never Touch)
| | Location |
|-|----------|
| Production backend | Render master service |
| Production database | Render PostgreSQL |
| Existing web frontend | `book-tracker-frontend/` |
| Mobile app | `book-tracker-mobile/` |
| master branch | No pushes until Phase 1 validated |

---

## Folder Structure (stitch-experiment branch)
```
book-tracker/
├── app/                                ← backend (shared, additive changes only)
├── book-tracker-frontend/              ← OLD web — frozen, do not touch
├── book-tracker-frontend-stitch/       ← NEW web — Stitch generates here
├── book-tracker-mobile/                ← mobile — frozen until Phase 2
└── context/
    ├── STITCH_CONTEXT.md               ← this file
    └── API_REGISTRY.md                 ← tracks any new/modified endpoints
```

---

## Environment Variables (Stitch Backend on Render)
```
DATABASE_URL=<supabase postgresql URL>
SECRET_KEY=<generate new one>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
CORS_ORIGINS=http://localhost:5173,https://<stitch-vercel-preview-url>
GOOGLE_BOOKS_API_KEY=<same as production>
GOOGLE_OAUTH_CLIENT_ID=<same as production>
GOOGLE_OAUTH_CLIENT_SECRET=<same as production>
VAPID_SUBJECT=<same as production>
VAPID_PUBLIC_KEY=<same as production>
VAPID_PRIVATE_KEY=<same as production>
```

## Environment Variables (Stitch Frontend)
```
VITE_API_BASE_URL=https://<stitch-render-service>.onrender.com
VITE_GOOGLE_CLIENT_ID=<same as production>
```

---

## Auth
- Google OAuth only — no email/password
- JWT stored in `localStorage` as `bt_token`
- All authenticated requests: `Authorization: Bearer <token>`
- Handle 401 by clearing token and redirecting to login

## Reading Status Values (Exact Strings Only)
- `to-read`
- `reading`
- `finished`

---

## Pages To Build — Web (Phase 1)
| # | Page | Key APIs |
|---|------|----------|
| 1 | Login / Landing | `POST /auth/google`, `POST /auth/demo-login` |
| 2 | Home — Community Feed | `GET /notes/feed`, `GET /notes/friends-feed`, `GET /userbooks/friends/currently-reading` |
| 3 | Library | `GET /userbooks/`, `PUT /userbooks/{id}/progress`, `GET /reading-activity/daily` |
| 4 | Search | `GET /googlebooks/search`, `POST /books/add-to-library` |
| 5 | My Profile | `GET /profile/me`, `PUT /profile/me`, `GET /reading-activity/daily` |
| 6 | User Profile | `GET /profile/{user_id}`, `POST /follow/{id}`, `DELETE /follow/{id}` |
| 7 | Notifications | `GET /notifications/unread`, `GET /notifications/list`, `PUT /notifications/{id}/read` |
| 8 | Settings | `PUT /profile/me`, `POST /auth/delete-account` |
| 9 | Admin (admin only) | `GET /admin/stats`, `GET /admin/users`, `POST /admin/push/test/{id}` |

## Screens To Build — Mobile (Phase 2)
| Screen | Mirrors Web Page |
|--------|-----------------|
| LoginScreen | Login / Landing |
| FeedScreen | Home — Community Feed |
| LibraryScreen | Library |
| SearchScreen | Search |
| ProfileScreen | My Profile |
| UserProfileScreen | User Profile |
| NotificationsScreen | Notifications |
| BookDetailScreen | Library detail |
| SettingsScreen | Settings |

---

## Design Principles (Web + Mobile Must Match)
- Same color palette, typography, and component feel across both platforms
- Mobile-first on web — minimum viewport 375px
- Consistent labels, status strings, and error messages everywhere
- Reading activity chart: same visual style on both platforms
- Post cards: avatar, book cover, text, quote, image, like count, comment count

---

## Key Gotchas
- **Broken images:** always add onError handler — Open Library returns 1×1 placeholder images
- **`userbook` is the pivot** — notes belong to userbook, not directly to book
- **Feed variants:** `/notes/feed` (all public) vs `/notes/friends-feed` (followed users only)
- **Comments push:** API works, push notification for comments has a known bug — show UI, skip notification
- **Admin routes:** return 403 for non-admin — hide admin nav unless `user.is_admin === true`
- **Token expiry:** JWT lasts 30 days, no refresh token — handle 401 by redirecting to login
- **Post editing:** show "Edited X ago" when `updated_at` differs from `created_at`

---

## Validation Checklist (Before Merging Phase 1 to Master)
- [ ] Google login works end-to-end
- [ ] Library loads, add book, update progress all work
- [ ] Community feed and friends feed load
- [ ] Post, like, comment all work
- [ ] Profile editable (bio, picture)
- [ ] Reading activity chart shows real data
- [ ] Follow / unfollow works
- [ ] Notifications bell shows unread count
- [ ] Works on mobile viewport (375px wide minimum)
- [ ] Admin page hidden for non-admin users

---

## Merge Plan

### Phase 1 — Web
1. All checklist items pass against stitch backend
2. Delete `book-tracker-frontend/`
3. Rename `book-tracker-frontend-stitch/` → `book-tracker-frontend/`
4. Update `VITE_API_BASE_URL` → production backend URL
5. Merge `stitch-experiment` → `master`
6. Vercel auto-deploys production
7. Decommission stitch Render service + Supabase project

### Phase 2 — Mobile
1. New screens validated against production backend
2. Replace screens in `book-tracker-mobile/src/screens/`
3. Full EAS build + Play Store submission
