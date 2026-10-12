# TrackMyRead iOS — what actually happened, and what to do next time

Written 2026-10-11, the day TrackMyRead first reached TestFlight. Everything here was
**measured on this project**, not read in a document. Where something contradicts the Medhark
playbook, the Medhark note is right for Medhark and this one is right for TrackMyRead — the
difference is said explicitly.

Account-level assets all transfer: Apple Developer **Team `U99PR4A2XB`**, the ASC API key
`4W4FHZ8NRR`, the distribution certificate, the APNs key. A new app is a new identifier under
the same account, not a new account or a second subscription.

---

## 0. The one that shapes everything else

**Medhark Parent and Staff were never submitted to the App Store.** Both sit at
`PREPARE_FOR_SUBMISSION`; they reached TestFlight and stopped. So the Medhark playbook ends at
TestFlight **because that is as far as this account has ever gone**. Everything past TestFlight —
screenshots, listing copy, the App Privacy questionnaire, review submission — had no precedent
and had to be worked out from scratch.

Check this with the ASC API before assuming a precedent exists:

```
GET /v1/apps/{id}/appStoreVersions   ->   attributes.appStoreState
```

---

## 1. Expo account: TrackMyRead is NOT under the Medhark account

`app.json` pins `extra.eas.projectId`. That project lives under **`ankitalkuhs`**; this machine
is logged in to Expo as `school-erp-nkshu` (Medhark). The first build died with:

```
Entity Not Authorized: AppEntity[9b559417-...] (viewer = RegularUserViewerContext[...], action = READ)
```

— an opaque id and nothing else. `app.json` now carries `"owner": "ankitalkuhs"`, so a wrong
login fails with a readable message instead.

**GitHub's `EXPO_TOKEN` secret cannot be reused for this.** GitHub never returns a secret's
value to anyone, by design. Create a *second* Expo access token
(https://expo.dev/settings/access-tokens — the form asks only for a name); it does not
invalidate the CI one. Keep it in `.env.expo`, which `.gitignore` already covers via `.env.*`.

Android CI never hit this because Actions authenticates with the token, not a login.

---

## 2. `eas submit` does NOT read the `EXPO_ASC_*` environment variables

The Medhark playbook lists `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID`
for non-interactive auth. Those are consumed by **credentials** operations (provisioning
profiles). `eas submit` reads the App Store Connect key **only from `eas.json`** — measured: with
all four set, submit still prompted *"Generate a new App Store Connect API Key?"*, and with
`--non-interactive` it failed outright.

Confirmed by grepping the CLI itself:

```
build/credentials/**  -> EXPO_ASC_*            (profiles, certificates)
build/submit/**       -> ascApiKeyPath, ascApiKeyId, ascApiKeyIssuerId   (eas.json only)
```

So `eas.json` carries:

```json
"submit": { "production": { "ios": {
  "ascAppId": "6821514742",
  "ascApiKeyPath": "./.credentials/AuthKey_4W4FHZ8NRR.p8",
  "ascApiKeyId": "4W4FHZ8NRR",
  "ascApiKeyIssuerId": "1e7092c7-6c58-4dd3-a356-c2a8b63696b7"
}}}
```

The path must be **project-relative** — an absolute `C:\Users\...` breaks CI and every other
machine. The `.p8` lives in `book-tracker-mobile-stitch/.credentials/`, ignored twice over
(`.credentials/` plus that folder's own `*.p8` rule). A test pins all of this.

---

## 3. Google Sign-In ships TWO native modules, and one of them crashes iOS

iOS is Apple-only here (Sprint 4G decision E-6), so the Google module should not be in the iOS
build at all. Removing it took two separate exclusions and then a third fix:

1. **`react-native.config.js`** — `platforms: { ios: null }` removes `RNGoogleSignin`, the
   React Native module.
2. **`package.json` → `expo.autolinking.ios.exclude`** — removes `ExpoAdapterGoogleSignIn`, the
   **Expo** module, which is autolinked by a different mechanism that never reads
   `react-native.config.js`. Without this the build still failed in `pod install`:

   ```
   [!] The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
       which do not define modules.
   ```

   (`AppCheckCore` arrives via GoogleSignIn. The documented workaround is forcing modular
   headers — that works, and ships Google's SDK and its privacy manifest inside a binary that
   can never call them. Excluding is better.)
3. **Do not `import` the package on iOS.** It runs
   `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` at *module scope*, and `getEnforcing`
   **throws** when the module is absent — so a static import kills the app on launch, before
   anything renders. That is exactly what build 1 did. Use a conditional `require` off-iOS.

Verify before building, instead of after:

```
npx expo-modules-autolinking resolve -p ios --json      # google modules must be absent
npx expo-modules-autolinking resolve -p android --json  # android unaffected
```

Android links this package through the React Native path, so it never appears in the Expo
module list — which is the control proving an iOS-scoped exclude cannot touch it.

---

## 4. `Dimensions.get('window')` at module scope — the iPad killer

It is evaluated **once, when the bundle loads**. On an iPad the scene is sized afterwards, and
changes again on rotation and in Split View. Any layout derived from it is simply wrong there.

This was in **seven** files, not one: `LoginScreen`, `AppTour`, `LibraryScreen`,
`InsightsScreen`, `OnboardingScreen`, `ProfileScreen`, `UserProfileScreen`. Symptoms on a real
iPad: a feature card clipped off the right edge, the onboarding tour's **Continue** button
off-screen in portrait, and **one book filling almost the whole Library page**.

Use `useWindowDimensions()`. A test (`A-15`) now sweeps every source file for the pattern.

**Unfreezing is often not enough.** `LibraryScreen` also hardcoded `numColumns={2}`, so a
correct width still produced two ~500pt tiles. Column count must come from the measured width,
and the `FlatList` needs a `key` tied to that count or it will not re-lay out on rotation:

```
width  390 -> 2 columns, 175pt   (phone, unchanged)
width  834 -> 4 columns, 193pt   (iPad portrait)
width 1194 -> 6 columns, 184pt   (iPad landscape)
```

**None of this is visible on Android**, because a phone's window never changes size — the frozen
value happens to be right. `supportsTablet: true` commits Apple to reviewing on iPad, so these
are plausible rejections. A borrowed iPad found more real bugs in one hour than 139 tests.

---

## 5. App Store Connect API: four things that bite

- **`POST /v1/bundleIdCapabilities` with `APPLE_ID_AUTH` 409s** unless you send a settings
  payload: `[{"key":"APPLE_ID_AUTH_APP_CONSENT","options":[{"key":"PRIMARY_APP_CONSENT"}]}]`.
  Register the identifier **before** creating the Sign in with Apple key, or the portal has no
  primary App ID to offer you.
- **`GET /v1/bundleIds/{id}/bundleIdCapabilities` returns `[]` even when capabilities exist.**
  Use `GET /v1/bundleIds?filter[identifier]=...&include=bundleIdCapabilities` and read
  `included`. Trusting the sub-collection endpoint means re-registering things that already
  exist. Cross-check against a known app to tell a real empty from a broken endpoint.
- **Builds cannot be attached to an *internal* TestFlight group** (422 `Builds cannot be
  assigned to this internal group`). Internal groups receive builds automatically. If a build
  is not appearing, the group has **no testers** — that is the real problem.
- **A tester 409s on a group unless the user has visibility of the app.** `POST
  /v1/users/{id}/relationships/visibleApps` first, then add them. (The Medhark playbook has
  this one and it was right.) Adding an *existing* `betaTester` record still 409'd; creating a
  fresh record with the group in its relationships worked.

---

## 6. Reading a failed build's log

There is no CLI command for it, and `build:view` has **no `--non-interactive` flag** — passing
it makes the command fail, which is silent if you have redirected stderr. Fetch the log through
GraphQL, and note it is **brotli-encoded**, which Python's stdlib cannot decompress:

```
POST https://api.expo.dev/graphql
  Authorization: Bearer $EXPO_TOKEN
  User-Agent: eas-cli/24.11.0 (darwin; node)      # Cloudflare 403s "code 1010" without one
  query($id: ID!){ builds { byId(buildId:$id){ status logFiles error { message } } } }

curl --compressed <logFiles[0]>                    # JSONL, one record per line, with `phase`
```

The log is what distinguished "the React Native module is gone" from "the Expo module is still
there" — two identical-looking `pod install` failures with different causes.

---

## 7. Apple token revocation needs a token you are probably not collecting

`POST appleid.apple.com/auth/revoke` takes a **refresh or access token**. The only way to get one
is to exchange the client's one-time `authorizationCode` at `auth/token`. A design that stores
only the `sub` can pass nothing useful, and Apple answers **400** — the deletion still succeeds,
but TrackMyRead stays listed under the reader's Apple ID, which is what review checks.

So the client must send `authorizationCode`, the server must exchange it, and the refresh token
must be stored (encrypted; here Fernet under `APPLE_TOKEN_KEY`, unindexed, no plaintext
fallback). Same `.p8`, same ES256 client secret, two endpoints.

Three ordering rules learned the hard way:
- Commit the `apple_sub` write **before** calling Apple. Lose it and *every* later sign-in
  creates a new account for ever, because Apple sends the email only on first authorization.
- `client_id` must be the same value at exchange and at revocation — Apple binds a refresh
  token to the client that obtained it.
- Revocation must **never** block a deletion. Guideline 5.1.1(v) outranks it.

---

## 8. Render: setting an env var through the API does not redeploy

The dashboard restarts the service; the API does not. The variables sit there correctly while
the running container has never read them — and `os.getenv` reads the process environment, fixed
at start. Trigger a deploy afterwards:

```
POST /v1/services/{id}/deploys   {"clearCache":"do_not_clear"}
```

Then verify by **behaviour**, not by status: poll an endpoint whose answer changes. `/auth/apple`
returning 404 means unconfigured; 401 means live and rejecting a bad token.

---

## 9. Release bookkeeping

`release/last-released.json` said `2.2.1 / 60` while Play had `2.2.3 / 62`, so the guard
protecting the next release was comparing against the wrong baseline. **Update it when you
publish**, not when you build.

Do not pin the current version in tests as a literal (`assert version === '2.2.4'`). That makes
every future release a red suite until someone finds the line. Assert the real invariant: the
tree is **ahead of** what the store last accepted.

---

## 10. The order that worked

1. Register the bundle id **with its capabilities** (ASC API) — before anything else.
2. Create the Sign in with Apple `.p8` (needs the identifier to exist).
3. Create the App Store Connect app record — **UI only, there is no API for it**.
4. `eas.json`: iOS build profiles + the submit block with `ascAppId` and the key path.
5. First build **interactively, once**, to create the distribution certificate: Yes to generate,
   Team Type **Individual**, and **skip push** (that prompt uses the broken Apple-ID login; the
   push *capability* is already on the identifier from step 1).
6. After that, everything is non-interactive: `eas build --non-interactive --no-wait`, then
   `eas submit --id <build>`.
7. Poll the **submission**, then poll **Apple** — Expo reporting `FINISHED` does not mean Apple
   has the build. It appeared on Apple's side a full two minutes later.
8. Internal TestFlight needs no review. **App Store review is a different thing entirely**, and
   nothing on this account has been through it.

**It took five builds.** 1 crashed on launch, 2 and 3 fixed that and the login, 4 and 5 fixed
iPad layout. Each round trip is about 6 minutes to build and 3 to appear in TestFlight, so the
expensive part is noticing — not building.

---

## 11. Verifying iPad layout without a Mac

There is no iOS Simulator on Windows — it ships inside Xcode only, and Expo offers no hosted
simulator. But the iPad bugs this project actually shipped (§4) were all in **shared JS reading
dp**, so an Android tablet AVD set to the iPad's own logical viewport exercises the same code
with the same numbers:

```
hw.lcd.width=1668      # iPad 11" at @2x
hw.lcd.height=2388
hw.lcd.density=320     # => 1668/2 x 2388/2 = 834 x 1194 dp, the iPad's logical size
skin.path=_no_skin
```

in `~/.android/avd/<name>.avd/config.ini`, created with

```
avdmanager create avd -n iPad11_Geom -k "system-images;android-34;google_apis;x86_64" -f
```

`adb -s emulator-<port> shell wm size` / `wm density` confirm it. **Pipe `printf 'no\n'`, not
PowerShell's `echo`, into `avdmanager`** — PowerShell prepends a BOM and avdmanager answers
`Error: ﻿no is not a valid reply`.

What this CANNOT find, and therefore what a device pass is still for: anything behind
`Platform.OS === 'ios'`, native modules that throw at import (§3), Sign in with Apple,
safe-area insets, iPad Split View and Slide Over, and iOS font metrics.

Not worth doing: `expo start --web`. It needs `react-native-web` + `react-dom` added as
dependencies to the binary being submitted, and RN-web's flex behaviour diverges enough to give
false confidence about exactly the measurements in question.

## 12. Four ways a check can pass while proving nothing

Each of these was hit on this project, and all four are silent.

**`eas build:view <id> --non-interactive` is not a valid invocation.** It yields an empty status
and exit 0, so a poller built on it reports nothing for ever while looking healthy. Use
`eas build:list --platform <p> --limit 1 --json --non-interactive` and read `[0].status`. This
one bit twice — once on the iOS submit poller, then again in a poller written *after* writing
it down, which is the argument for a shared helper rather than a remembered fact.

**`node --test "qa/unit/*.test.mjs"` expands to nothing in Git Bash on Windows.** Output is
`# tests 0 / # pass 0` and **exit code 0** — a green run that ran no tests. CI is Ubuntu, where
node expands the glob, so the floor check (`$PASS -lt $EXPECTED_MIN_TESTS`) is the only thing
standing between this and a merge. Locally, pass the files explicitly. A pass count of 0 is
never a pass.

**Whether `eas build` uploads committed or working-copy state is not worth knowing.** With
`requireCommit` unset, `--json` suppresses the line that would tell you, and `gitCommitHash` in
the result is just `HEAD` either way — it is *not* evidence the build matches that commit.
**Commit, push, then build**, and verify the build's `gitCommitHash` equals the pushed SHA.

**Reading a file with Python text mode and writing it back with `newline=''` converts CRLF to
LF** across the whole file. Here it was invisible because git normalises on commit, so
`git diff --stat` showed only the real change — but `git status` listing a file you believe you
reverted is the tell. Confirm with `git diff --ignore-cr-at-eol --stat <file>`; empty means the
content is genuinely unchanged.
