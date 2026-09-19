# ADR-001: Fix F-69 by not waiting for identity, not by caching identity

**Status:** proposed (Sprint 4D architecture, 2026-09-20). It becomes accepted when the PM approves the spec.

## Context
Every signed-in web page waits for `GET /profile/me` (1.5–1.9 s) before it mounts (F-69). There are two ways to stop that wait:
1. **Mount without waiting.** Pages render while `/profile/me` is in flight; identity-dependent UI waits for it.
2. **Keep the last profile in `localStorage`.** On reload, render at once from the stored profile and revalidate in the background (stale-while-revalidate).

## Decision
**Option 1.** A page's own requests never needed the profile: they carry the token, and the server checks every one. So option 1 removes the whole wait on every page except `/admin` and `/onboarding`. It persists nothing.

Option 2 would add only one thing beyond option 1: the avatar and name ~1.5 s sooner. It could not safely unblock `/admin` either, because `is_admin` must not come from storage. In exchange it creates an identity cache that must be invalidated correctly on every path, on a site used on shared computers.

## Consequences
- For about the first second, the nav shows `?` and own-post controls appear late (spec E-1).
- There is no stored identity to leak, go stale or be tampered with.
- F-68 (region move) shrinks `/profile/me` to ~0.35 s, which makes option 2's remaining benefit smaller still.

## If a profile cache is ever wanted, these rules are required
- **Key.** Store it only with a fingerprint of the token it came from, for example the first 16 hex characters of the SHA-256 of `bt_token`. Use it only when the stored fingerprint matches the current token. A different token means another account, so ignore and delete the entry.
- **Write.** Write only from a successful `/profile/me` response, never from `login()` payloads or local edits.
- **Invalidate:**
  - in `logout()`
  - in the `api.js` 401 branch, next to `clearToken()` (a Sprint 4C-owned file: coordinate)
  - in `login()`, before the new user is set
  - on account deletion (which goes through `logout()`)
  - on any `/profile/me` failure
- **Display only.** Allowed: `name`, `username`, `profile_picture`. Never trusted from the cache:
  - `is_admin`: `AdminRoute` and every admin control wait for this load's answer
  - `id`, for "is this my profile" and own-post checks
  - `is_private_profile`, `yearly_goal`, `stats`
- **Revalidate** on every page load, and replace the displayed values with the server's answer.
- **The server stays the authority on every permission.** A cache changes only what is drawn first.
