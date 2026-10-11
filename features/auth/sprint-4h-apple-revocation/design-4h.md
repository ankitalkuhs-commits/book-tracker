---
screen: sprint-4h-apple-revocation
feature: auth
package: the whole sprint — one package, API + client + SQL
designed_by: Architect/Builder (branch `sprint-4h-apple-revocation`, worktree `.claude/worktrees/4h-revoke`)
designed: 2026-10-11
base: `2c2a48b` (master, deployed)
supersedes: nothing. It REPAIRS Sprint 4G's P3 (R-13), whose build notes diagnosed the fault.
---

# Design — Sprint 4H: Apple token revocation that can actually succeed

## The fault, in one paragraph

Sprint 4G shipped R-13: a best-effort call to `POST https://appleid.apple.com/auth/revoke` on
account deletion, authenticated with an ES256 `client_secret` built from a Sign in with Apple
`.p8`. The call is correct in every respect except the one that matters. Apple's `token`
parameter takes a **refresh or access token**, and 4G had only the Apple **subject** to put
there, because `/auth/apple` persists `apple_sub` and nothing else. Apple answers a subject with
`400`. So once the PM sets `APPLE_PRIVATE_KEY`, every Apple reader's deletion logs
`apple revoke: status 400`, the deletion completes correctly, and the reader's Apple ID keeps
listing TrackMyRead under *Settings -> Apple ID -> Password & Security -> Apps Using Apple ID*.
That is the one thing R-13 exists to prevent and the item App Review checks, so it blocks
submitting for sale. The previous Builder measured this and reported it as finding 1 of
`build-notes-4g-revoke.md` rather than inventing a column; this sprint is that column.

## The flow

```
iOS client                         API                                   appleid.apple.com
──────────                         ───                                   ─────────────────
AppleAuthentication.signInAsync()
  -> credential {
       identityToken,
       authorizationCode,   <- NEW, one-time
       fullName, ... }
POST /auth/apple
  { identity_token, nonce,
    full_name?,
    authorization_code? }  ──────> verify_identity_token()      ───────> GET  /auth/keys (cached)
                                   resolve/create the reader
                                   user.apple_sub = sub
                                   db.commit()            <- R-03's write, alone in its txn
                                   ────────────────────────────────────
                                   exchange_authorization_code()────────> POST /auth/token
                                     grant_type=authorization_code         { refresh_token, ... }
                                     code, client_id, client_secret
                                   seal_token(refresh_token)      <- Fernet, APPLE_TOKEN_KEY
                                   user.apple_refresh_token = …
                                   db.commit()            <- second, independent commit
                             <──── { access_token, is_new, private_relay, user }

...later...

POST /auth/delete-account/me ────> if user.apple_sub:
                                     revoke_token(
                                       unseal_token(user.apple_refresh_token),
                                       audiences[0])       ──────────────> POST /auth/revoke
                                                                            token=<refresh token>
                                   cascade + db.commit()                    token_type_hint=refresh_token
                             <──── { "message": "Account deleted" }
```

### The five decisions inside that flow

1. **The exchange is after R-03's commit, never inside it.** `user.apple_sub` is the Apple
   identity; if that write is lost, every later sign-in creates another account for ever (4G's
   F4). An outbound call to Apple must not be able to take it down with it. A failed second
   commit is survivable by comparison: no refresh token, the next sign-in brings a fresh code,
   and the deletion completes either way.
2. **`authorization_code` is optional and conditional on both sides.** The TestFlight build in
   readers' hands today does not send one. A required field would `422` every one of those
   readers out of the app.
3. **`client_id` is `audiences[0]` at the exchange and at the revocation — literally the same
   expression.** Apple binds the code, the refresh token and the client together; a token
   obtained as the verified `aud` and revoked as `audiences[0]` would be a silent mismatch the
   moment `APPLE_AUDIENCES` held more than one entry. Today it holds exactly one, the bundle id
   `com.bookpulse.mobile` (4G architecture E-2 item 5). The known limitation of choosing
   consistency: with a genuinely multi-valued `APPLE_AUDIENCES`, a token that verified against
   the second entry would be exchanged against the first and Apple would refuse it. That is a
   configuration this project does not have, and the alternative is a mismatch that fails
   silently six months later instead of immediately.
4. **Every sign-in carrying a code re-exchanges**, not only the first. A reader who revoked us
   from Apple's own Settings and came back has a dead token stored, and the freshly issued one
   replaces it. Sign-in happens about once per install, so the extra round trip is cheap, and
   the alternative (`if not user.apple_refresh_token`) is both more code and less correct.
5. **Neither new function raises.** Deletion outranks revocation (Guideline 5.1.1(v)) and
   sign-in outranks both. `exchange_authorization_code` and `revoke_token` return their outcome;
   `seal_token` and `unseal_token` return `None` for every failure mode they have.

## The storage decision, and what it exposes

**Decision: a nullable `user.apple_refresh_token VARCHAR(512)` holding a Fernet ciphertext
(AES-128-CBC + HMAC-SHA256) under `APPLE_TOKEN_KEY`, which lives only in the Render environment.
No plaintext fallback: with the key unset, nothing is written at all.**

Why encrypt. The attacker this project actually has is read-only on the database. One Supabase
instance is shared by dev and production by choice, the repository is public, and backups exist.
A key held in the process environment is precisely the control for that attacker and for no
other — and it is cheap: `cryptography` is already installed through `python-jose[cryptography]`,
so there is no new dependency and no new moving part in the deploy.

Why no fallback. A security property that depends on whether an environment variable happens to
be set is not a property. With `APPLE_TOKEN_KEY` unset the column stays NULL, the deletion sends
nothing, and the system behaves exactly as the deployed Sprint 4G does — a state that is already
tested and already in production. `seal_token` returning `None` and the caller writing nothing is
the whole mechanism; MUT-4H-04 is the mutation that proves it.

Why not unindexed-but-plaintext, which would have been less code. Because the honest reading of
the threat model above is that a database read is the likely breach here, and "it is useless
without the `.p8`" is an argument about *this* Apple endpoint today, not a property of the value.

**What an attacker with database read access could do with it — plainly:**

- **Database only: nothing.** They get a Fernet ciphertext. Unsealing needs `APPLE_TOKEN_KEY`;
  *using* an Apple refresh token needs the `.p8` to build the `client_secret`. Neither is in the
  database, in the repository, or in CI. The column is not indexed and is never serialised, so it
  does not appear in any API response or any query plan.
- **Database *and* the Render environment** (an application-server compromise): they hold
  `APPLE_TOKEN_KEY` and `APPLE_PRIVATE_KEY` both, and the encryption buys nothing. This is the
  case worth stating without hedging. Even then, what the token grants is bounded: exchange at
  `auth/token` with `grant_type=refresh_token` for a fresh `id_token`/`access_token`, or
  revocation — **both scoped to this app's Sign in with Apple relationship and nothing else of
  the reader's Apple ID**. It is not access to iCloud, mail, or any other Apple service. The
  `id_token` it yields reveals the reader's Apple `sub` and their relay or real email, both of
  which that attacker can already read out of the `user` row they are standing in.
- **It is not a way back into TrackMyRead.** An `id_token` minted from a refresh grant carries no
  `nonce` claim, and `apple_keys.verify_identity_token` rejects a token whose `nonce` is absent
  (`AppleTokenInvalid("nonce missing")` -> 401). So the stolen token cannot be replayed at
  `/auth/apple` to impersonate the reader.
- **Rotation costs the stored tokens, and that is the right trade.** A new `APPLE_TOKEN_KEY`
  cannot unseal values sealed under the old one. Those readers' deletions send nothing until
  their next sign-in re-exchanges, and the deletion completes regardless. Nothing needs
  re-encrypting and nothing needs a migration. B-56 is that case.

## The PM SQL, and the deploy order

`context/PM_SQL_QUEUE.md` **step 9** — the next unused number, checked: steps 1-8 exist, 8 is
Sprint 4G's `apple_sub`.

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS apple_refresh_token VARCHAR(512);
```

Nullable, no default, **no index**. Metadata-only on every supported PostgreSQL version, so no
row is rewritten and it is safe to re-run. No index because nothing ever looks a reader up by
this value, and an index on a credential is that credential in one more place on disk and in one
more backup.

Verification query, as it appears in the queue:

```sql
-- 1 row: character varying, 512, YES
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND table_name = 'user' AND column_name = 'apple_refresh_token';
-- must return 0 rows: this column is deliberately NOT indexed
SELECT indexname FROM pg_indexes
 WHERE tablename = 'user' AND indexdef LIKE '%apple_refresh_token%';
-- must return 0: nothing has been written yet
SELECT count(*) FROM "user" WHERE apple_refresh_token IS NOT NULL;
```

### Deploy order — not negotiable

```
1. PM runs step 9 in the Supabase SQL Editor and sends the verify output back.
2. ONLY THEN is this branch merged to master. Pushing to master IS the deploy.
3. PM sets APPLE_TOKEN_KEY on Render (and APPLE_TEAM_ID / APPLE_KEY_ID /
   APPLE_PRIVATE_KEY, if the .p8 has arrived). No deploy; all are read per request.
4. TestFlight build with the new client, then the one-time manual check:
   sign in, delete the account, confirm TrackMyRead is gone from
   "Apps Using Apple ID".
```

Why that order and not the instinctive one:

- `app/schema_guard.py` raises at startup from `assert_migrated` (`app/schema_guard.py:52` after this sprint's +7; the brief cited the pre-4H `:39-41`), called at `app/main.py:166` when a required
  column is absent, so **deploying before the SQL fails the deploy and the previous version keeps
  serving**. That is the guard working as designed, and still a failed deploy somebody has to
  explain — which is why step 1 comes first.
- `("user", "apple_refresh_token")` in `schema_guard.REQUIRED_COLUMNS` and
  `models.User.apple_refresh_token` **travel in the same commit, deliberately.** A model column
  deployed without its guard entry is the April 2026 outage: the service boots and then 500s on
  every `User` query. The guard entry is what converts that into a refused deploy. The thing that
  must not be in the same deploy is the **SQL**, and the SQL is not deployed at all — the PM runs
  it by hand, before the merge.
- Steps 3 and 4 can lag arbitrarily. With `APPLE_TOKEN_KEY` unset the column stays NULL and
  revocation is inert, which is exactly today's deployed behaviour.

## What is deliberately not in this sprint

- **No retry on the exchange.** Apple's code is single-use, so a retry after a response Apple did
  process is guaranteed `invalid_grant`, and sign-in is a reader waiting on a screen.
- **No backfill.** Existing Apple readers have no stored code to exchange — Apple's code is
  one-time and gone. They get a refresh token on their next sign-in on the new build. Nothing can
  be done for a reader who deletes their account before signing in again, and their deletion
  still completes.
- **No change to `/auth/apple`'s five linking branches, its response shape, or `apple_sub`.**
- **No new dependency.** `requirements.txt` is untouched and still UTF-16LE.
