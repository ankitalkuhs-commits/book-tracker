# App Store listing — TrackMyRead (draft for PM review)

Drafted 2026-10-11. Everything here is written from what the app actually does, checked against
its own screens and copy. **Nothing has been submitted.** Two sections need your sign-off before
anything goes to Apple: the **App Privacy** answers (a declaration in your name) and the **age
rating**.

App: `com.bookpulse.mobile` · ASC id `6821514742` · currently 2.2.4 build 5 in TestFlight.

---

## Name and subtitle

**Name:** `TrackMyRead` (11 chars, limit 30)

**Subtitle:** `Track books. Read together.` (27 chars, limit 30)

Says what it is and that it is social, which is the one thing a reading-tracker subtitle usually
fails to convey. Alternatives if you dislike it: `Your reading life, together` (27) ·
`A reading journal with friends` (30).

---

## Promotional text (170 chars — editable without a new release)

```
Sign in with Apple and bring your shelf with you. Log what you read, keep the lines worth
keeping, and see what your friends are reading.
```

Worth using for seasonal or launch messaging later, since it updates without review.

---

## Description

```
TrackMyRead is a reading journal that other readers can see — if you want them to.

Keep your shelf
Add books by title, author or ISBN, or bring your whole Goodreads library across in one
import. Mark what you are reading, what you have finished, and what is waiting.

Log the page, not just the book
Track progress page by page. Set a yearly goal and watch it fill. Your reading day is your
day, wherever you are — the app works in your own time zone, not a server's.

Keep the lines worth keeping
Save quotes, write notes, and record how a chapter made you feel. Keep them private, or
share them.

Read with people
Follow friends and see what they are reading. Join a Circle — a small reading group with its
own feed, goals and leaderboard. Reply to what people post, or just read along.

See your year
Pages and books over time, your longest streak, what you finished and when. Quiet statistics,
not a scoreboard.

Private by default where it matters
Every note is private unless you share it. You can make your whole profile private, block
anyone, and delete your account — with everything in it — from inside the app.

TrackMyRead works on iPhone, iPad, Android and the web, and your library is the same
everywhere.
```

Honest about what it is, no superlatives, no claims about other apps. Apple rejects
descriptions that mention other platforms *as a comparison*; naming Android as a place your
library also lives is fine and is a genuine selling point here.

**Note:** the "block anyone" line is true only once Sprint 4I-B ships. Remove it if the listing
goes up first.

---

## Keywords (100 characters, comma-separated, no spaces)

```
reading,book tracker,bookshelf,reading log,book journal,TBR,reading goal,quotes,bookclub,readers
```

99 characters. The app name is already indexed, so "TrackMyRead" is deliberately absent — it
would waste ten of them.

---

## Category

- **Primary: Books** — where readers look.
- **Secondary: Lifestyle** — not Social Networking, which invites comparison with much larger
  apps and sets expectations about messaging the app does not meet.

---

## Age rating — **needs your decision**

TrackMyRead shows user-generated content: a public feed, comments and profiles. Apple's
questionnaire asks about frequency and intensity. The honest answer is
**"Infrequent/Mild" for User-Generated Content**, which lands at **12+**.

Claiming 4+ with an open public feed is the kind of thing that gets caught at review and costs a
rejection round. 12+ is both accurate and safe.

---

## App Privacy — **needs your sign-off, it is a legal declaration**

Verified from the code, not assumed: the app has **no analytics, crash-reporting, advertising or
attribution SDK of any kind** (28 dependencies, none of them tracking). So:

**Used to track you across apps and websites: NO** — nothing, anywhere.
**Third-party advertising: NONE.**

| Apple data type | Collected | Linked to identity | Purpose |
|---|---|---|---|
| Contact Info → Name | yes | yes | App Functionality |
| Contact Info → Email Address | yes | yes | App Functionality |
| User Content → Photos | yes | yes | App Functionality (profile picture, images on notes) |
| User Content → Other User Content | yes | yes | App Functionality (notes, quotes, posts, comments) |
| Identifiers → User ID | yes | yes | App Functionality |
| Identifiers → Device ID | yes | yes | App Functionality (push notification token only) |
| Usage Data | **no** | — | — |
| Diagnostics | **no** | — | — |
| Location | **no** | — | — |
| Contacts | **no** | — | — |
| Browsing History | **no** | — | — |
| Purchases / Financial Info | **no** | — | — |

Two points worth saying out loud because reviewers check them:

- **Hide My Email.** If a reader uses it, we only ever receive Apple's private relay address. The
  privacy policy now says this.
- **Reading data** (books, progress, goals) is **User Content**, not Usage Data. Usage Data means
  analytics about how you use the app, which we do not collect.

Privacy policy: `https://www.trackmyread.com/privacy`

---

## Support and marketing URLs

- Support: `https://www.trackmyread.com/support` — **live**, shipped 2026-10-11, required by Apple.
- Marketing: `https://www.trackmyread.com`

---

## Review notes (the free-text box — this is where rejections are avoided)

```
Sign-in: this app uses Sign in with Apple only on iOS. There is no password to supply —
please sign in with any Apple ID, including a test one. A fresh sign-in creates a new empty
account, which is the normal first-run experience.

Account deletion is in Settings > Delete account, inside the app. It is immediate and
permanent, and it also revokes this app's access to your Apple ID.

User-generated content: the community feed shows posts from other readers. Content can be
reported from the menu on any post, comment or profile, and readers can block each other.
Reports reach a moderator and are reviewed within 2 working days. Published contact:
trackmyread.dev@gmail.com and https://www.trackmyread.com/support

Some accounts in the feed are clearly-labelled automated accounts run by us (@TMRBot,
@TMRPrompts, @TMRQuotes, @TMRCircles). They post reading prompts and bestseller listings.
They are marked with a BOT badge and cannot follow, like or comment.
```

The last paragraph is there deliberately: a reviewer who spots four accounts posting on a
schedule and is not told about them may read it as inauthentic activity.

---

## Screenshots — **blocked on the PM**

Required: 6.9" (or 6.7") iPhone. Since `supportsTablet: true`, **iPad screenshots are also
required** — and that is the device class where this app was most broken until today, so they
are worth taking carefully.

Suggested five, in order: Library · a book's detail page · the community feed · a Circle ·
Insights.

Only you can take these. Send me the files and I will upload and order them through the API.

---

## What still blocks submission

1. **Sprint 4I** — report and block. In build. Guideline 1.2 rejects a UGC app without them.
2. **Screenshots** — yours.
3. **Age rating and App Privacy** — your sign-off on the two sections above.
4. **A device walkthrough of build 5** — every screen on the iPad, not just the fixed ones.
