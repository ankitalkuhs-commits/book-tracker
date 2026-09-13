# Web interaction runs — 2026-09-13

`qa/interaction_audit.mjs` on `https://www.trackmyread.com` as review.reader. Every element classified `side_effect: none` was clicked / typed / toggled; **every non-GET API request was aborted by the harness** (none were attempted — `BLOCKED_MUTATION` = 0, so no inventory entry was mislabelled). Data-changing elements are covered by `qa/scenarios_web.mjs`.

| run | elements | OK | CRASH | PAGE_ERROR | API 5xx | BLOCKED_MUTATION | NOT_FOUND | skipped (side effect / upload / route) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A (feed/library/book/search/profile) | 115 | 25 | 0 | 0 | 0 | 0 | 45 | 44 |
| B (circles/settings/notifications/admin/public) | 69 | 9 | 3 | 0 | 0 | 0 | 12 | 45 |

## Failures

| element | route | result | finding |
|---|---|---|---|
| `web.bookdetail.load_via_url` | `/library/book/:userbookId` | ACTION_ERROR → `None` | locator.count: InvalidSelectorError: Error while parsing selector `n/a — page-load effect, not a clickable element` - unexpected symbol "/" at position 1 |
| `web.about.back` | `/about` | CRASH → `blank` | **F-57** Back = `navigate(-1)`; with no in-app history (direct visit, Google, Play Store privacy link) it leaves to a blank page |
| `web.privacy.back` | `/privacy` | CRASH → `blank` | **F-57** Back = `navigate(-1)`; with no in-app history (direct visit, Google, Play Store privacy link) it leaves to a blank page |
| `web.terms.back` | `/terms` | CRASH → `blank` | **F-57** Back = `navigate(-1)`; with no in-app history (direct visit, Google, Play Store privacy link) it leaves to a blank page |

## Worked (navigation, tabs, filters, menus, inputs)

- **A**: `nav.link.tab` · `nav.mobile.link_toggle_close` · `nav.avatar.toggle` · `apptour.avatar_preset` · `home.composer.text` · `home.composer.quote_input` · `home.composer.emotion_chip` · `home.recommendation.preview` · `home.feed.tab` · `home.post.author_link` (/home→/profile/111) · `home.post.menu_toggle` · `home.post.comments_toggle` · `home.sidebar.user_search` · `home.sidebar.following_item` (/home→/profile/111) · `home.sidebar.friend_reading_item` · `library.tabs.status` · `library.search` · `library.book_card` (/library→/library/book/856) · `bookdetail.readmore_toggle` · `search.format_chip` · `search.tab_google_community` · `profile.add_bio_prompt` · `profile.note.menu_toggle` · `profile.note.edit_start` · `userprofile.velocity_range_toggle`
- **B**: `groups.list.createNew` (/groups→/groups/new) · `groups.list.searchInput` · `groups.detail.back` (/groups/7→/groups) · `groups.detail.editOpen` · `groups.detail.leaderboard.periodTab` · `groups.detail.newPostOpen` · `groups.detail.book.setOpen` · `groups.detail.disbandOpen` · `blog.list.backHome` (/blog→/home)

## Not reached by a single-click harness (coverage gaps, not app bugs)

| element | route | why |
|---|---|---|
| `web.nav.mobile.menu_toggle` | `*` | conditional state — mobile viewport (md:hidden) |
| `web.nav.admin_link` | `*` | conditional state — admin only (user.is_admin) |
| `web.nav.avatar.profile_link` | `*` | conditional state — avatarOpen=true |
| `web.nav.avatar.settings_link` | `*` | conditional state — avatarOpen=true |
| `web.toast.dismiss` | `*` | conditional state — whenever toast() is called anywhere in the app |
| `web.bookpreview.close` | `/home, /profile/:userId (via BookPreviewModal)` | conditional state — a book preview is open |
| `web.bookpreview.status_select` | `/home, /profile/:userId` | conditional state — book not already in the user's library |
| `web.bookpreview.view_in_library` | `/home, /profile/:userId` | conditional state — book already in the user's library |
| `web.apptour.nav_next_back` | `*` | conditional state — tour steps 1-4 (nav spotlight) |
| `web.apptour.goal_preset` | `*` | conditional state — tour step 6 (goal setup) |
| `web.apptour.goal_custom_input` | `*` | conditional state — useCustom=true |
| `web.apptour.book_skip_continue` | `*` | conditional state — tour step 7 |
| `web.home.composer.remove_image` | `/home` | conditional state — an image has been selected |
| `web.home.composer.book_picker_toggle` | `/home` | conditional state — user has at least one book in their library |
| `web.home.composer.book_picker_select` | `/home` | conditional state — book picker dropdown open |
| `web.home.composer.book_picker_clear` | `/home` | conditional state — a book is tagged |
| `web.home.post.edit_start` | `/home` | conditional state — owner only |
| `web.home.post.edit_cancel` | `/home` | conditional state — editing=true |
| `web.home.post.comment_input` | `/home` | conditional state — comments expanded |
| `web.home.sidebar.user_search_result` | `/home` | conditional state — search has results |
| `web.library.header.add_book` | `/library` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.library.empty_state.add_first_book` | `/library` | conditional state — library empty, tab=all, no search query |
| `web.library.sidebar.add_new_book` | `/library` | conditional state — desktop viewport only (hidden lg:block sidebar) |
| `web.library.addmodal.close` | `/library` | conditional state — modal open |
| `web.library.addmodal.search_input` | `/library` | conditional state — modal open |
| `web.bookdetail.back` | `/library/book/:userbookId` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.bookdetail.progress_input` | `/library/book/:userbookId` | conditional state — status === 'reading' |
| `web.bookdetail.note_textarea_quote` | `/library/book/:userbookId` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.search.query_input` | `/search` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.search.result_status_select` | `/search` | conditional state — result not yet added |
| `web.profile.avatar_edit_button` | `/profile` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.profile.name_edit_button` | `/profile` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.profile.editbio.name_input` | `/profile` | conditional state — modal open |
| `web.profile.editbio.bio_textarea` | `/profile` | conditional state — modal open |
| `web.profile.editbio.cancel` | `/profile` | conditional state — modal open |
| `web.profile.settings_link` | `/profile` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.profile.new_note_trigger` | `/profile` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.profile.newnote.book_select` | `/profile` | conditional state — user has at least one 'reading' book AND modal open |
| `web.profile.newnote.text_quote` | `/profile` | conditional state — modal open |
| `web.profile.newnote.cancel` | `/profile` | conditional state — modal open |
| `web.profile.note.edit_quote_text` | `/profile` | conditional state — editing=true |
| `web.profile.note.edit_cancel` | `/profile` | conditional state — editing=true |
| `web.userprofile.currently_reading_preview` | `/profile/:userId` | conditional state — target user has books with status='reading', profile not locked |
| `web.userprofile.curated_library_book` | `/profile/:userId` | conditional state — target user has books, profile not locked |
| `web.userprofile.show_all_books_toggle` | `/profile/:userId` | conditional state — books.length > 6 |
| `web.groups.list.myGroupCard.open` | `/groups` | conditional state — when user has at least one active group |
| `web.groups.detail.leaderboard.rowClick` | `/groups/:groupId` | conditional state — when leaderboard has rows |
| `web.groups.detail.activity.loadMore` | `/groups/:groupId` | conditional state — when activity.length > visibleActivity |
| `web.groups.detail.posts.loadMore` | `/groups/:groupId` | conditional state — when posts.length > visiblePosts |
| `web.groups.detail.book.preview` | `/groups/:groupId` | conditional state — when group.current_book is set |
| `web.groups.create.privacyToggle` | `/groups/new` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.groups.create.inviteSearchAdd` | `/groups/new` | conditional state — search results present |
| `web.settings.about.internalLinks` | `/settings` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.login.footerLinks` | `/` | logged-in visitor is redirected from / to /home |
| `web.blog.list.postLink` | `/blog` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.about.legalLinks` | `/about` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |
| `web.blog.list.bottomCta` | `/blog` | label/name mismatch in inventory locator (e.g. icon ligature, description text in accessible name, prose name) |

**Takeaway:** the read-only surface of the web app is healthy — no crashes, page errors, 5xx or unexpected mutations across 34 exercised elements, except F-57. The risk sits in the data-changing paths (adversarial report) and in performance (api-perf report).
