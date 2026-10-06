---
screen: sprint-4g-apple-signin
feature: auth
package: P4 — the iOS client (the Apple button, the reader messaging, the eas.json iOS profiles)
built_by: Builder (branch `builder-4g-client2`, worktree `.claude/worktrees/4g-client`)
built: 2026-10-07
base: `c0522c6` — P1+P2 merged (`POST /auth/apple` with `private_relay` is in this tree, so
  `apiContract.test.mjs` can match the new `api.js` path literal; G-4G-00 holds by construction)
---

# Build notes — Sprint 4G, P4

## What was built

| File | Change |
|---|---|
| `book-tracker-mobile-stitch/package.json` | `+ "expo-apple-authentication": "~8.0.8"`, `+ "expo-crypto": "~15.0.8"`. **Not invented:** both read out of `node_modules/expo/bundledNativeModules.json` of the installed `expo@54.0.33`, which is the file `npx expo install` resolves against |
| `package-lock.json` | `npm install --package-lock-only` — **24 inserted lines, nothing re-resolved.** Required: CI runs `npm ci`, which aborts if the two files disagree, and the Android job would then run zero tests |
| `app.json` | `ios` gains `usesAppleSignIn: true`, `buildNumber: "1"`, `config.usesNonExemptEncryption: false`. `version`/`android.versionCode` **deliberately not bumped** — see finding 1 |
| `eas.json` | `ios` blocks on all three build profiles. `android`, `cli` and `submit` byte-identical to the base |
| `src/services/api.js` | `appleLogin(identityToken, nonce, fullName)` beside `googleLogin`. `full_name` is omitted from the body when absent |
| `src/screens/LoginScreen.js` | `+ 2` imports, `+ 1` `useState`, `+ 1` line in the existing `useEffect`, `+ handleAppleSignIn` beside an untouched `handleSignIn`, the Apple button + the pre-tap notice above the Google block, `+ APPLE_BTN_HEIGHT`, `+ styles.appleBtn`, `+ styles.appleNotice`. **89 inserted lines, 0 deleted** |
| `src/i18n/locales/{de,en,es,fr,pt,ru}.json` | four `auth.apple*` keys each, appended after `sessionExpiredBody` |
| `__tests__/appleSignIn.test.mjs` (new) | 15 cases: A-01, A-02, A-02a, **A-02b**, A-03..A-12, **A-13** |
| `.github/workflows/ci-tests.yml:155` | Android floor `121 → 136`, re-measured |

Nothing else under `book-tracker-mobile-stitch/` is touched, and A-07 asserts that over both the
committed diff and the working tree.

## The sites I changed, and the anchors I matched on

Every walker in the new suite locates its target by **content**, never by line number.

| Site | Anchor |
|---|---|
| the availability gate | the single `CallExpression` whose callee source is `AppleAuthentication.isAvailableAsync`, then the `useState` pair whose **setter name appears in that statement** — so the test never hardcodes `appleAvailable`/`setAppleAvailable`, it derives them |
| the Apple button | the one `JSXElement` whose tag resolves to `AppleAuthenticationButton` (via a `jsxName` that reads `JSXMemberExpression`, because the namespace import style makes the tag `AppleAuthentication.AppleAuthenticationButton`) |
| the Google button | the one `TouchableOpacity` whose opening tag matches `/styles\.googleBtn(?![A-Za-z0-9_$])/` — 4F's `styles.userName`/`styles.userNameRow` lesson |
| the Google block, for byte identity | `{/* Google sign-in */}` → the first following `</TouchableOpacity>` |
| `handleSignIn`, for byte identity | `const handleSignIn = async () => {` → the first following `\n  };` |
| the guards | the nearest `LogicalExpression` ancestor of each button, climbing out of the fragment |
| the shared parent | the nearest **`JSXElement`** ancestor of each button, skipping expression containers, logicals and fragments — both resolve to the `ScrollView` |
| the button height | `theme.js`'s `type.title.lineHeight` + 2 × `googleBtn.paddingVertical` + 2 × `googleBtn.borderWidth`, all three read from source. Today 24 + 30 + 3 = **57**. Never a literal in the test |
| the pre-tap notice | the one `<Text>` whose single child is `t('auth.apple…')` |
| the after-the-fact message | the one `IfStatement` in `handleAppleSignIn` whose test mentions `is_new`, then the `Alert.alert` inside it and the three `t()` keys it carries |

### The vacuity rules, honoured specifically

- Every walk asserts **its count against a literal first** (`assert.equal(els.length, 1, …)`) before
  reading anything out of what it found.
- Three detectors are run against a **synthetic negative** in the same test: A-01 (a `Platform.OS`
  gate must not satisfy the gate detector), A-05 (a catch block that alerts on cancel must report
  exactly 1 violation), A-10 (a bare JSX string must not satisfy the `t()` detector).
- A-07 asserts its change set is **non-empty and contains `LoginScreen.js`** before asserting
  nothing unexpected is in it.
- A-12 asserts `APPLE_KEYS.length === 4` before looking any key up, and additionally asserts every
  key is **used** in `LoginScreen.js` — which is what makes MUT-61 (dropping `private_relay`) red
  twice over instead of leaving dead copy behind.

## The copy — E-5, all six locales

Four keys. The pre-tap line carries all three of A-10's content anchors (a new/separate account, a
differing address, the existing library); both bodies carry a route out (Google or support).

**`auth.appleNoticeBeforeTap`** — rendered above the Apple button, inside the positive branch of the
availability gate, so it is read before the tap.

| | |
|---|---|
| en | Signing in with Apple creates a separate account if your Apple ID uses a different email address, or if you choose Hide My Email. Your existing library stays on the account you signed up with. |
| de | Die Anmeldung mit Apple erstellt ein separates Konto, wenn deine Apple-ID eine andere E-Mail-Adresse verwendet oder wenn du „E-Mail-Adresse verbergen“ wählst. Deine bisherige Bibliothek bleibt in dem Konto, mit dem du dich registriert hast. |
| es | Iniciar sesión con Apple crea una cuenta separada si tu ID de Apple usa otra dirección de correo electrónico o si eliges «Ocultar mi correo electrónico». Tu biblioteca actual permanece en la cuenta con la que te registraste. |
| fr | La connexion avec Apple crée un compte distinct si votre identifiant Apple utilise une autre adresse e-mail ou si vous choisissez « Masquer mon adresse e-mail ». Votre bibliothèque actuelle reste sur le compte avec lequel vous vous êtes inscrit. |
| pt | Entrar com a Apple cria uma conta separada se o seu ID Apple usar outro endereço de e-mail ou se você escolher «Ocultar meu e-mail». A sua biblioteca atual continua na conta com que você se cadastrou. |
| ru | Вход через Apple создаёт отдельный аккаунт, если в вашем Apple ID указан другой адрес электронной почты или если вы выберете «Скрыть e-mail». Ваша текущая библиотека останется в том аккаунте, с которым вы регистрировались. |

**`auth.appleNewAccountTitle`** — the alert title on `is_new`.

| | |
|---|---|
| en | New account created |
| de | Neues Konto erstellt |
| es | Cuenta nueva creada |
| fr | Nouveau compte créé |
| pt | Nova conta criada |
| ru | Создан новый аккаунт |

**`auth.appleNewAccountBody`** — `is_new && !private_relay`. This is the one the server **cannot**
disambiguate: it must be true both for a genuinely new reader and for someone who already has an
account under an address they did not give us. So it states the fact and names the condition rather
than asserting which case the reader is in.

| | |
|---|---|
| en | We created a new TrackMyRead account for this Apple ID. If you already use TrackMyRead with a different email address, that account is separate and still holds your books — open trackmyread.com in your browser and sign in with the address you used before, or contact support and we will help. |
| de | Wir haben für diese Apple-ID ein neues TrackMyRead-Konto erstellt. Wenn du TrackMyRead bereits mit einer anderen E-Mail-Adresse nutzt, ist dieses Konto davon getrennt und enthält weiterhin deine Bücher – öffne trackmyread.com im Browser und melde dich mit der bisherigen Adresse an, oder wende dich an den Support, wir helfen dir. |
| es | Hemos creado una cuenta nueva de TrackMyRead para este ID de Apple. Si ya usas TrackMyRead con otra dirección de correo electrónico, esa cuenta es independiente y conserva tus libros: abre trackmyread.com en el navegador e inicia sesión con la dirección que usabas antes, o escribe al soporte y te ayudaremos. |
| fr | Nous avons créé un nouveau compte TrackMyRead pour cet identifiant Apple. Si vous utilisez déjà TrackMyRead avec une autre adresse e-mail, ce compte est distinct et contient toujours vos livres : ouvrez trackmyread.com dans votre navigateur et connectez-vous avec l'adresse que vous utilisiez, ou contactez le support et nous vous aiderons. |
| pt | Criamos uma nova conta do TrackMyRead para este ID Apple. Se você já usa o TrackMyRead com outro endereço de e-mail, aquela conta é separada e continua com os seus livros — abra trackmyread.com no navegador e entre com o endereço que você usava, ou fale com o suporte, que vamos ajudar. |
| ru | Мы создали новый аккаунт TrackMyRead для этого Apple ID. Если вы уже пользуетесь TrackMyRead с другим адресом электронной почты, тот аккаунт отдельный, и ваши книги остались в нём — откройте trackmyread.com в браузере и войдите с прежним адресом, или напишите в поддержку, и мы поможем. |

**`auth.appleNewAccountRelayBody`** — `is_new && private_relay`. The one case the server knows for
certain (pm-decisions addendum Q-1), so it names Hide My Email instead of hedging.

| | |
|---|---|
| en | You chose Hide My Email, so Apple gave us a private relay address and we created a new, empty account for it. Your books are still on the account under your own email address — open trackmyread.com in your browser and sign in with that address, or contact support and we will help. |
| de | Du hast „E-Mail-Adresse verbergen“ gewählt, daher hat Apple uns eine anonyme Weiterleitungsadresse gegeben und wir haben dafür ein neues, leeres Konto erstellt. Deine Bücher liegen weiterhin in dem Konto mit deiner eigenen E-Mail-Adresse – öffne trackmyread.com im Browser und melde dich mit dieser Adresse an, oder wende dich an den Support, wir helfen dir. |
| es | Elegiste «Ocultar mi correo electrónico», así que Apple nos dio una dirección de reenvío privada y hemos creado una cuenta nueva y vacía para ella. Tus libros siguen en la cuenta de tu propio correo electrónico: abre trackmyread.com en el navegador e inicia sesión con esa dirección, o escribe al soporte y te ayudaremos. |
| fr | Vous avez choisi « Masquer mon adresse e-mail », Apple nous a donc transmis une adresse relais privée et nous avons créé un nouveau compte vide. Vos livres se trouvent toujours sur le compte associé à votre propre adresse e-mail : ouvrez trackmyread.com dans votre navigateur et connectez-vous avec cette adresse, ou contactez le support et nous vous aiderons. |
| pt | Você escolheu «Ocultar meu e-mail», então a Apple nos deu um endereço de encaminhamento privado e criamos uma conta nova e vazia para ele. Os seus livros continuam na conta do seu próprio e-mail — abra trackmyread.com no navegador e entre com esse endereço, ou fale com o suporte, que vamos ajudar. |
| ru | Вы выбрали «Скрыть e-mail», поэтому Apple передал нам приватный адрес для пересылки, и мы создали для него новый пустой аккаунт. Ваши книги остались в аккаунте с вашим собственным адресом электронной почты — откройте trackmyread.com в браузере и войдите с этим адресом, или напишите в поддержку, и мы поможем. |

### The route out, corrected (coordinator, 2026-10-07)

The first version of both bodies said **"sign in with Google to reach it"**. That was wrong, and
wrong in the worst available way: this message appears **only on iOS**, where E-6 means there is no
Google button on the screen. It read as an instruction and pointed at a control the reader does not
have, leaving support as the only real route — worse than saying nothing, because the reader spends
their effort hunting for a button that was deliberately removed.

Both bodies now point at **`trackmyread.com` in the browser**, which the same iPhone can reach in
Safari, and keep the support line as the fallback. The web client is Google-only too, but that is
not a problem here: on the web the Google button exists, and the sentence names a destination
("open trackmyread.com and sign in with the address you used before") rather than a control.

**This is now asserted, in every locale, not just reviewed.** A-11 checks each body in all six
files for `trackmyread.com` and asserts the word `Google` does **not** appear — the brand name is
the same string in all six languages, so a translator reintroducing the dead end turns the suite
red. MUT-4G-68 and MUT-4G-69 prove both halves bite. The old anchor tests.md gives for A-11
(`/Google|support|help|contact/i`) would have **accepted** the broken copy, because `Google` is one
of its alternatives; that alternative is the bug and it is removed.

### Accepted gap: the synthesised `@users.noreply.trackmyread.com` address

A branch-5 reader — one whose email Apple will not vouch for — gets
`apple-<digest>@users.noreply.trackmyread.com` as their account address, and nothing in this copy
explains it. **Deliberately left unexplained, and here is the reasoning rather than a shrug.**

The moment of confusion is in **Settings**, where `SettingsScreen.js:621` renders `profile?.email`
weeks later. That file is not P4's — architecture §P4 says "nothing in P4 touches
`SettingsScreen.js`" and A-07 turns red if it is touched — so fixing it where the confusion happens
is a different package's work.

The one surface this package *does* own where it could be said is the `is_new` alert, and putting it
there costs more than it buys: a branch-5 reader is indistinguishable from a branch-4 reader in the
response (`private_relay` is the relay flag, not a "placeholder address" flag), so the client would
have to **detect it by matching `data.user.email` against the server's placeholder domain** — a new
client/server coupling to a string that lives in `auth_router.py` — and a one-off login alert is not
read again at the moment the reader actually wonders, in Settings, months later. A half-fix with a
coupling attached is worse than a recorded gap.

**Recommendation for the PM:** either explain it in Settings (one line beside the address, owned by
whoever next touches that screen), or have the server return the placeholder-ness explicitly so a
client does not have to infer it from a domain string. Both are out of P4.

## What I did about `eas.json` (addendum K-10)

```json
"development": { …, "ios": { "simulator": true } },
"preview":     { …, "ios": { "simulator": true } },
"production":  { …, "ios": { "buildConfiguration": "Release" } }
```

Three decisions worth stating:

1. **`simulator: true` on development and preview is the point, not a shortcut.** Any other iOS
   distribution needs a device UDID, a certificate and a provisioning profile registered with
   Apple, and this package is explicitly forbidden from registering anything. A simulator build
   needs none of that, so these two profiles are runnable today by whoever has the credentials; the
   production profile is the one that waits on the Apple account.
2. **`submit.production` is left empty on purpose.** An `ios` submit block needs `ascAppId` and
   `appleTeamId` — values that do not exist until the PM creates the App Store Connect record.
   Inventing them would be a plausible-looking lie in a config file. A-13 asserts `submit` is still
   byte-identical to the base, so this stays a conscious gap.
3. **Two of the three things K-10 names are not `eas.json` fields at all** — see finding 2.

No EAS build was run and nothing was registered with Apple.

## Decisions I made, and why

- **The nonce travels raw in both directions.** `apple_keys.py:182-186` compares the body's `nonce`
  to the token's `nonce` claim with `hmac.compare_digest`, i.e. **verbatim**, and its floor is 32
  characters. Apple echoes `ASAuthorizationAppleIDRequest.nonce` into the token unchanged, so the
  client gives Apple and the server the same 64-character hex string. **This is deliberately not
  Firebase's convention**, which sends `sha256(raw)` to Apple and `raw` to the server; doing that
  here would compare a hash against a raw string and 401 every single sign-in. The cost of the
  simpler scheme is that the nonce is readable inside the identity token, which is acceptable: its
  job is binding one token to one request, and E-3 already records that it cannot stop a replay by
  whoever holds the token.
- **`.then(setAppleAvailable, () => setAppleAvailable(false))`, not `await`.** The architecture says
  "await … into a new `appleAvailable` state" *and* "the entire Android-visible diff is one
  `useState` and one line inside the existing `useEffect`". Turning the effect body async to get a
  literal `await` would restructure the existing effect. One line, same semantics, and the rejection
  handler is belt-and-braces: **measured**, `isAvailableAsync()` in `expo-apple-authentication@8.0.8`
  returns `false` rather than throwing when the native module is absent
  (`build/AppleAuthentication.js:9-14`), so Android resolves false and never rejects.
- **The Google block is wrapped from outside.** `{!appleAvailable && (<>` and `</>)}` sit on their own
  lines around the existing block, whose indentation and bytes are untouched. That is what lets
  A-02a assert byte identity while E-6's "no Google button on iOS" is still implemented.
- **The full name is joined from the credential, never fabricated.** `[givenName, familyName]
  .filter(Boolean).join(' ')` is `''` when Apple sends neither, and `api.js` omits `full_name`
  entirely for a falsy value — so R-07's email-prefix fallback stays reachable.
- **`buttonStyle` is `BLACK`** on a cream background beside a white Google pill. A design call, not a
  requirement; D-4G-02's screenshot is where it gets judged.
- **The in-flight state swaps the button for a spinner, and that was fixable after all.**
  `AppleAuthenticationButton` takes no `disabled` prop and ignores any style we give it, so the
  Google button's `disabled={loading}` has no counterpart — the first version of this package
  maintained `setLoading` and rendered nothing, which I flagged. The fix needs none of the forbidden
  styling: reuse the Google button's **own** idiom and swap the control for
  `<View style={styles.appleLoading}><ActivityIndicator/></View>`, a plain View of identical
  footprint (`width: '100%'`, `height: APPLE_BTN_HEIGHT`, `marginBottom: 20`), so nothing on the
  screen moves. Swapping it out is also the re-entrancy guard `disabled={loading}` provides on the
  Google side: while the request is in flight there is no Apple button on screen to tap twice.
  A-02(f) asserts the swap exists, is conditioned on `loading`, contains exactly one
  `ActivityIndicator`, and that the stand-in's height equals the **computed** 57 — MUT-66, 67 and 70
  prove each of those.
  One consequence worth stating: this put the Apple button inside a `ConditionalExpression`, which
  made A-03's literal ancestor-chain comparison fail for a reason that has nothing to do with
  disclosures. A-03 now compares the **element** ancestor chains (and additionally asserts the Apple
  button is a direct element-child of the `ScrollView`), which is the faithful reading of "neither is
  nested one level deeper" — a transient loading state is not a container a reader has to get past.
  MUT-49 is still caught, by the disclosure-condition scan, which is what caught it before.

## Findings — what I found wrong in the spec, the plan or the brief

Ordered by how much they matter.

1. **R-11's version bump cannot be executed, and does not need to be.** Two *existing* 4F tests pin
   `app.json` to `2.2.4`/`63` as literals: `botBadge.test.mjs::app_json_is_2_2_4_63` (`:299-303`) and
   `::versionGuard_and_apiContract_still_green` (`:328-330`, `assert.match(r.stdout, /versionCode=63/)`).
   I bumped to `2.2.5`/`64` first and measured the result: **`# tests 121, # pass 119, # fail 2`**.
   Editing those two tests is not an option for this package, so the bump is reverted. It is also
   unnecessary: `check-version-bump.js --strict` compares against `release/last-released.json`
   (`2.2.1`/`60`), which `2.2.4`/`63` already clears — exactly what tests.md K-11 says. **The bump
   belongs to whoever cuts the release and updates `release/last-released.json`, and at that moment
   those two literal pins must be relaxed or the release is blocked.** Worth a triage row.
   The brief attributes this hazard to `localDate.test.mjs`; that file was already fixed (it asserts
   `versionCode >= 62`). The live pins are in `botBadge.test.mjs`.
2. **Two of the three things K-10 asks `eas.json` for are not `eas.json` fields.** A build profile's
   `ios` block has no `buildNumber` and no `usesNonExemptEncryption`. With
   `cli.appVersionSource: "local"` the build number is `app.json`'s `expo.ios.buildNumber`, and the
   export-compliance flag is `expo.ios.config.usesNonExemptEncryption` (it becomes
   `ITSAppUsesNonExemptEncryption` in `Info.plist`). I put each where it actually works and A-08
   asserts both. The decision's intent is met; its file attribution is wrong.
3. **tests.md's P4 section predates E-6 and contradicts it.** A-02 ("two buttons, Apple **first**,
   with equal measured width, height and corner radius"), A-03 ("the two buttons' ancestor chains …
   are identical") and D-4G-02 ("both above the fold") all assume Apple and Google render together.
   Under E-6 they never do. I kept A-02 and A-03 as **source-shape** assertions — they still catch
   every mutation tests.md names for them — and added **A-02b**, which asserts the two guards are
   `appleAvailable` and `!appleAvailable`, i.e. that there is no Google button on iOS. That is the
   assertion E-6 actually needs and tests.md has no case for.
4. **A-02(c) as written is against `expo-apple-authentication`'s documented contract.** tests.md
   asserts `appleBtn.borderRadius === googleBtn.borderRadius`. The module's own documentation
   (`build/AppleAuthenticationButton.js:13-17`) says style `borderRadius` and `backgroundColor`
   "will not work and is against the App Store Guidelines" on that native view, and that the corner
   comes from the `cornerRadius` **prop**. So `appleBtn` sets neither, `cornerRadius` is
   `APPLE_BTN_HEIGHT / 2`, and the test instead asserts (a) `appleBtn` sets no `borderRadius` and no
   `backgroundColor`, (b) `googleBtn` still uses the `radius.full` pill token, (c) `radius.full`
   (999) still clamps to a pill at this height, so the two corners are the same shape. MUT-63 and
   MUT-64 are new rows that prove the replacement bites.
5. **P4 needed one more test than tests.md's 13, and the count is 15 not 134.** A-02b (finding 3) and
   A-13 (there was no case at all for the `eas.json` profiles K-10 added to this package) take the
   file to 15 and the Android suite to **136**. The floor at `ci-tests.yml:155` is raised to 136 in
   this commit with that reasoning in a comment.
6. **A-07 as written cannot catch MUT-53 before the commit.** `git diff 5fc8ccc...HEAD` reads
   committed state only, so a working-tree edit to `FeedScreen.js` is invisible to it — the trap the
   API builder hit on MUT-4G-37. A-07 asserts over the **union** of the committed diff and
   `git status --porcelain`, so it bites in both states, and MUT-53 was proved in the working tree
   without a throwaway commit.
7. **Byte-identity assertions must normalise line endings on Windows, or they are always red.**
   `core.autocrlf=true`, so the working tree is CRLF and `git show` returns LF. A-02a's first run
   reported the Google block as modified when nothing had been touched. Both sides are normalised,
   and the assertion is about content. CI is Linux and would not have shown this — the reverse of
   the API package's caveat (a) and worth knowing for whoever writes the next one.
8. **My own detectors fired on my own comments, twice, and on `toString(` once.** The first run of
   `appleSignIn.test.mjs` was `# fail 3`: `doesNotMatch(/Platform\.OS/)` and
   `doesNotMatch(/Math\.random/)` matched the code comments that explain why neither is used, and
   `doesNotMatch(/String\(/)` matched `b.toString(16)` in the nonce encoder. Every text scan now runs
   against the source with comments blanked out at the same byte offsets, and the stringify scan has
   a left boundary. A plan that says "assert `/Math\.random/` does not appear" should say "in code".
9. **tests.md's A-01 describes the Apple button's tag as `AppleAuthenticationButton`.** With the
   namespace import that Expo documents, the tag is a `JSXMemberExpression` and a `jsxName` copied
   from `botBadge.test.mjs` returns `null` for it — the walk finds nothing, and a walk that finds
   nothing passes everything. `jsxName` here reads the property name. This is precisely the
   vacuity trap the brief names, and it would have been silent.
10. **Q-1's `private_relay` is in the response and the client reads it.** tests.md's Q-1 paragraph
    still recommends against it ("Adding a `relay: true` key to the response would break R-08 and is
    not recommended") and proposes a single message for all three rows. pm-decisions' addendum
    overrides that. The implementation follows the addendum; tests.md's Q-1 and B-30 should be
    updated, as the API package's finding 6 also says.
11. **`features/auth/index.md:117`'s "mobile navigates to `OnboardingScreen` on `is_new`" is not
    what this screen does.** `LoginScreen` calls `onLoginSuccess?.()` and the decision is `App.js`'s.
    The alert is raised before that call, so it sits over whatever comes next. Not a defect — but the
    citation is one level off, and anyone auditing where a new Apple reader lands will go to the
    wrong file.
12. **tests.md's A-11 content anchor would have passed the broken copy.** Its anchor is
    `/Google|support|help|contact/i`, and the first version of this package's non-relay body said
    "sign in with Google to reach it" — which satisfies that regex while telling an iOS reader to use
    a button E-6 removed from their screen. The plan's anchor list is where that defect was allowed
    to live, not just my wording. A-11 now requires the web route in every locale and forbids
    `Google` in all six (MUT-68, MUT-69). **tests.md's A-11 row should lose `Google` from its
    alternatives**, or the next person writing this copy makes the same mistake and the suite agrees
    with them.
13. **`a11yTouchables.test.mjs` is blind to this screen's new button** (K-17, confirmed):
    `AppleAuthenticationButton` is not in `TOUCHABLE_TAGS`, and the pre-tap notice is a plain `Text`
    with no size or contrast assertion anywhere. Nothing here proves the notice is legible at the
    largest accessibility text size, or that it is not clipped. Still section-10 territory.

## Proof that Android is untouched

Four independent pieces, three of them automated:

1. **`# tests 121, # pass 121, # fail 0`** on the pre-existing `__tests__` suite with every source
   change of this package in the tree and **no existing test file edited** — measured before the new
   test file was added. The whole suite is 136 after it.
2. **A-02a**: the Google `TouchableOpacity` block and `handleSignIn` are byte-identical to
   `5fc8ccc`, located by content anchors. MUT-48 (`activeOpacity={0.85}` → `0.9`) and MUT-57b (an
   alert added to `handleSignIn`) both go red.
3. **A-07**: nothing under `book-tracker-mobile-stitch/` changed outside the 12-path allowlist, over
   the committed diff *and* the working tree. MUT-53 (one blank line in `FeedScreen.js`) goes red
   naming the file.
4. **The runtime argument, measured not assumed.** `isAvailableAsync()` in
   `expo-apple-authentication@8.0.8` returns `false` — it does not throw — when the native module is
   absent, so on Android `appleAvailable` stays `false`, the Apple branch renders nothing and the
   Google branch renders the unchanged block. The Android-visible delta is one `useState`, one
   promise that resolves `false`, and a guard expression around an identical element tree.
   `qa/unit` (the web side) is **38/38, untouched**.

## Mutation-proof table (G-4G-08)

Procedure per row: snapshot the named files, apply the edits, run **only** the named test file(s),
record the first red line, restore from the snapshot, verify the restore is byte-identical, re-run
and confirm green. Driven by a script, so each row is exactly the edit it claims and no row can be
forgotten. The script refuses a row whose anchor is missing or not unique, and refuses a row that
did not actually change a file on disk — "caught" cannot be recorded against a no-op.

Rows 46–58 are tests.md's. **63, 64, 65** are new for finding 4 and for A-02's shrink mutation;
**59** is new for A-02b (finding 3); **60** for A-13; **61, 62** for the `private_relay` branch and
the export-compliance flag; **66, 67, 70** for the in-flight swap and **68, 69** for the corrected
route out, both added for the coordinator's 2026-10-07 correction.

Two rows had to be re-anchored rather than re-written, and the driver is why they were caught:
MUT-63's anchor `width: '100%', height: APPLE_BTN_HEIGHT,` stopped being unique the moment
`appleLoading` was added, and MUT-70's `{loading ? (` was never unique because the Google button has
one of its own. The driver **refused both** instead of mutating the wrong site — which is exactly
the failure a looser driver would have recorded as "caught".

| MUT-4G | File | Change | Case(s) red | Observed first red line | Caught | Restored |
|---|---|---|---|---|---|---|
| 46 | LoginScreen.js | branch on `Platform.OS === 'ios'` | A-01, A-02b, A-10 | `the Apple button is not gated on appleAvailable` / `+ "Platform.OS === 'ios'"  - 'appleAvailable'` | yes | yes |
| 47 | LoginScreen.js | render the Apple button below the Google one | A-02 | `the Apple button is not first: apple at 9172, google at 7488` | yes | yes |
| 47b | LoginScreen.js | `googleBtn.paddingVertical: 15 → 10` | A-02 | `appleBtn.height must equal theme type.title.lineHeight (24) + 2*googleBtn.paddingVertical (10) + 2*googleBtn.borderWidth (1.5)` / `57 !== 47` | yes | yes |
| 48 | LoginScreen.js | `activeOpacity={0.85}` → `0.9`, inside the Google block | A-02a | `the Google sign-in block has been edited` + the two differing `<TouchableOpacity …>` lines | yes | yes |
| 49 | LoginScreen.js | wrap the Apple button in a `showMoreOptions` toggle | A-03, A-01, A-02b, A-10 | `apple is behind a disclosure: appleAvailable && showMoreOptions` | yes | yes |
| 50 | LoginScreen.js | hoist the nonce to module scope | A-04 | ``expected exactly one `nonce` declaration inside handleAppleSignIn, found 0`` / `0 !== 1` | yes | yes |
| 50b | LoginScreen.js | `Math.random().toString(36)` as the nonce | A-04 | `the nonce does not come from expo-crypto` | yes | yes |
| 51 | LoginScreen.js | `Alert.alert` in the `ERR_REQUEST_CANCELED` branch | A-05 | `the ERR_REQUEST_CANCELED branch alerts — a reader who dismisses the sheet must not be told sign-in failed` / `+ ["Alert.alert(t('auth.errorSignInFailed'), '')"]  - []` | yes | yes |
| 52 | api.js | `body.full_name = String(fullName)` unconditionally | A-06 | `appleLogin stringifies full_name` | yes | yes |
| 53 | FeedScreen.js | one blank line, in a file P4 does not own | A-07 | `P4 touched files it does not own: book-tracker-mobile-stitch/src/screens/FeedScreen.js` | yes | yes |
| 54 | app.json | drop `"usesAppleSignIn": true` | A-08 | `Expected values to be strictly equal:` / `+ undefined  - true` | yes | yes |
| 54b | app.json | `android.package` → `com.trackmyread.mobile` | A-08 | `+ 'com.trackmyread.mobile'  - 'com.bookpulse.mobile'` | yes | yes |
| 55 | package.json | `"expo-crypto": "*"` | A-09 | `expo-crypto is not pinned to a concrete version: *` | yes | yes |
| 56 | LoginScreen.js | delete the pre-tap `Text` element | A-10, A-12 | `expected exactly one pre-tap auth.apple* <Text>, found 0` / `0 !== 1`; and `auth.appleNoticeBeforeTap is in the locales but not used in src/screens/LoginScreen.js` | yes | yes |
| 56b | LoginScreen.js | a bare string literal instead of `t('auth.appleNoticeBeforeTap')` | A-10, A-12 | same two lines | yes | yes |
| 57 | LoginScreen.js | ignore `is_new` (`if (false)`) | A-11 | `handleAppleSignIn ignores is_new — a duplicate account would be silent` | yes | yes |
| 57b | LoginScreen.js | the same message on the Google path | A-02a, A-11 | `handleSignIn has been edited`; and `the Google handler carries Apple copy` | yes | yes |
| 58 | locales/de.json | remove one `auth.apple*` key | A-12 **and** the pre-existing `i18nParity::key_sets_match_en_except_ru_few_many` | `de:auth.appleNewAccountBody is missing` / `+ 'undefined'  - 'string'`; parity: `de` + the key-set diff | yes | yes |
| **59** | LoginScreen.js | render the Google button unconditionally (both buttons on iOS) | A-01, A-02b | `the Google button is not gated on !appleAvailable` / `+ 'true'  - '!appleAvailable'`; and `+ 'BooleanLiteral'  - 'UnaryExpression'` | yes | yes |
| **60** | eas.json | drop the `ios` block from the production profile | A-13 | `the production profile has no ios block — the sprint cannot build for iOS` | yes | yes |
| **61** | LoginScreen.js | one body for both cases (drop `private_relay`) | A-11, A-12 | `expected three i18n keys in the alert (title + two bodies), found auth.appleNewAccountTitle, auth.appleNewAccountBody` / `2 !== 3`; and `auth.appleNewAccountRelayBody is in the locales but not used` | yes | yes |
| **62** | app.json | drop `ios.config.usesNonExemptEncryption` | A-08 | `without this, App Store Connect asks an export-compliance question on every upload` / `+ undefined  - false` | yes | yes |
| **63** | LoginScreen.js | style the Apple corner with `borderRadius` | A-02 | `appleBtn sets borderRadius, which expo-apple-authentication ignores and the App Store guidelines forbid` | yes | yes |
| **64** | LoginScreen.js | drop the `cornerRadius` prop | A-02 | `the Apple button passes no cornerRadius prop` | yes | yes |
| **65** | LoginScreen.js | `APPLE_BTN_HEIGHT = 48` (shrink the button) | A-02 | `appleBtn.height must equal … (15) … (1.5)` / `48 !== 57` | yes | yes |
| **66** | LoginScreen.js | remove the loading swap entirely (no feedback in flight) | A-02(f) | `the Apple button is not swapped for anything while loading — a reader gets no feedback` | yes | yes |
| **67** | LoginScreen.js | `appleLoading` height 40 (the stand-in is a different size) | A-02(f) | `the in-flight stand-in is a different height from the button it replaces — the layout would jump` / `40 !== 57` | yes | yes |
| **68** | locales/en.json | the non-relay body says "sign in with Google to reach it" | A-11 | `en:auth.appleNewAccountBody tells an iOS reader to use Google, which E-6 removed from their screen` | yes | yes |
| **69** | locales/fr.json | one locale loses the web route | A-11 | `fr:auth.appleNewAccountRelayBody names no route the reader can take from this phone` | yes | yes |
| **70** | LoginScreen.js | the swap is conditioned on something other than `loading` | A-02(f) | `the swap is conditioned on false, not loading` | yes | yes |

**30 of 30 rows caught; none stayed green, and none needed a structural substitute.** Every row was
applied and reverted, and the working tree is clean afterwards. MUT-68 is the one worth reading
twice: it is the coordinator's correction turned into a test, and it is red **in English** — the
locale a reviewer would actually read.

### The synthetic negatives (the brief's "prove the detector can fail")

| Detector | Synthetic input | Result |
|---|---|---|
| the availability gate (A-01) | `{Platform.OS === 'ios' && <AppleAuthenticationButton/>}` | the guard's left-hand side is not an `Identifier` — the detector rejects it |
| the cancel-is-silent walk (A-05) | a `catch` whose `ERR_REQUEST_CANCELED` branch calls `Alert.alert` | exactly **1** violation reported |
| the `t()`-call notice walk (A-10) | `<Text style={styles.appleNotice}>Hard-coded copy</Text>` | **0** matches — a bare string cannot satisfy it |

The locale checks need no synthetic input: MUT-68 and MUT-69 **are** the negative, applied to the
shipped files and reverted.

## Suite counts

| Suite | Before | After | Command |
|---|---|---|---|
| Android `__tests__` | **121 / 121** (measured on this branch at `c0522c6`) | **136 collected, 136 pass, 0 fail, 0 skipped** | `node --test "__tests__/*.test.mjs"` from `book-tracker-mobile-stitch/`, with `NODE_PATH` at **`book-tracker-mobile-stitch/node_modules`** |
| qa/unit | 38 / 38 | **38 / 38, untouched** | `node --test "qa/unit/*.test.mjs"` |
| pytest | **779 collected** (re-measured here, matches the API package) | 779, untouched — no Python file is in this diff | `.venv\Scripts\python -m pytest tests -q --collect-only` |

All three briefed baselines were correct. The `NODE_PATH` warning was correct too: the repo-root
`node_modules` gives `# tests 30, # fail 9`.

CI floors: `:155` raised **121 → 136** in this commit. `:66` (pytest 779) and `:116` (qa/unit 38) are
not this package's and are left alone.

## What is still not proved

Everything tests.md section 10 says, unchanged, plus:

- **No device, no simulator, no build.** Every one of the 15 cases is an assertion over source. P4
  proves the client's *shape*; it proves nothing about what iOS renders. D-4G-01..03 and
  P-4G-05..09 remain **BLOCKED** until somebody with the Apple credentials runs
  `eas build -p ios --profile development` (which the new profile now makes possible without
  registering a device) and, for TestFlight, `--profile production` after the App Store Connect
  record exists.
- **Nothing proves Apple accepts our nonce verbatim.** The reasoning is Apple's documented
  pass-through of `ASAuthorizationAppleIDRequest.nonce` plus the shape of the server's comparison.
  The first real sign-in is the test. If the nonce ever came back hashed, **every** Apple sign-in
  would 401 with `nonce mismatch` and the fix is one `sha256` in `handleAppleSignIn` — worth putting
  in front of whoever runs P-4G-05 so they recognise it in a second rather than an afternoon.
- **`APPLE_AUDIENCES` must be exactly `com.bookpulse.mobile`** for this client to work at all.
  A-08 pins the bundle id; nothing in this repo can check the Render env var.
- **The two new native modules are not installed anywhere in this repo.** The lockfile entries are
  resolved and integrity-pinned, and `npm ci` will fetch them, but no build has linked them.
- **Accessibility of the Apple button and the pre-tap notice** — see finding 13.
- **Nothing proves the corrected route out actually works.** The copy now says "open
  trackmyread.com and sign in with the address you used before". That the web client signs that
  reader in to the account holding their books is true of the product today, but no test here
  touches the web app, and `qa/unit` is asserted **unchanged** by design. P-4G-06 and P-4G-07 are
  where somebody follows that sentence on a real phone and confirms it ends somewhere.
