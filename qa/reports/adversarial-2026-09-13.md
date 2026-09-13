# TrackMyRead adversarial probe — 2026-09-13

Target: `https://book-tracker-stitch.onrender.com`  (review.reader=110, review.friend=111)

**PASS 122 · FAIL 12 · INFO 53**  created 20 / cleaned 20

## FAILs

- **IDOR** · `POST /notes/204/comments` (token=reader→friend private note, body=comment on is_public=False note) · expected 403/404 (should not be commentable) · got 201 `{"id":24,"text":"seen your private note","created_at":"2026-09-13T12:55:04.688921Z","user":{"id":110,"name":"Review.Reader"}}` · likes_comments.create_comment does not check note.is_public / author privacy
- **IDOR** · `POST /notes/204/like` (token=reader→friend private note, body=like on is_public=False note) · expected 403/404 · got 201 `{"message":"Liked","liked":true}` · likes_comments.like_note does not check note.is_public / author privacy
- **Validation** · `PATCH /userbooks/882` (token=reader, body=rating='abc') · expected 422 or clamp · got 500 `Internal Server Error` · PATCH payload is an unvalidated dict → crud.update_userbook setattr
- **Validation** · `GET /notes/feed` (token=reader, body=limit=-1) · expected 422 or cap<=200 · got 500 `Internal Server Error` · /books/ caps via Query(ge=1,le=200); /notes/* have no cap
- **Validation** · `GET /notes/me` (token=reader, body=limit=-1) · expected 422 or cap<=200 · got 500 `Internal Server Error` · /books/ caps via Query(ge=1,le=200); /notes/* have no cap
- **Validation** · `PATCH /notifications/prefs` (token=reader, body=valid 7-key payload) · expected 200 · got 500 `Internal Server Error` · write path — GET /prefs works but this PATCH 500s on every payload (endpoint broken)
- **Validation** · `PATCH /notifications/prefs` (token=reader, body=unknown extra key) · expected 200 ignored · got 500 `Internal Server Error` · same 500 as the valid payload — not caused by the extra key
- **State/race** · `POST /books/add-to-library` (token=reader x2 concurrent, body=same google_id; statuses=[200, 200]) · expected 1 userbook row · got 200 `2 userbook rows for this book` · duplicate-guard is a check-then-insert, not a unique constraint
- **State/race** · `POST /notes/212/like` (token=reader x3 concurrent, body=like own note) · expected likes_count==1 · got 201 `likes_count=3` · like has no unique(note_id,user_id); concurrent inserts can duplicate
- **State/race** · `POST /follow/111` (token=reader x2 concurrent, body=double follow; statuses=[200, 200]) · expected 1 follow row · got 200 `2 follow rows` · follow has no unique constraint; concurrent inserts can duplicate
- **State/race** · `DELETE /userbooks/864` (token=reader, body=delete userbook that has reading_activity rows (book_id 837)) · expected 200 FK-safe · got 500 `Internal Server Error` · delete_userbook does not pre-delete reading_activity; reading_activity.userbook_id FK blocks the delete → 500. LEFTOVER: userbook 864 (review.reader) cannot be removed via API and STILL EXISTS — needs a manual Supabase delete of its reading_activity rows then the userbook.
- **Public** · `GET /api/googlebooks/search` (token=none, body=unauth max_results=40 start_index=999999) · expected 200 · got 500 `{"detail":"Unexpected error: "}`

## All probes

| # | Category | Method | Path | Token | Body | Expected | Status | Verdict | Body/Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | AuthN | GET | `/profile/me` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 2 | AuthN | GET | `/userbooks/` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 3 | AuthN | GET | `/notes/me` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 4 | AuthN | GET | `/books/recommendations` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 5 | AuthN | GET | `/follow/following` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 6 | AuthN | GET | `/groups/my` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 7 | AuthN | GET | `/users/following` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 8 | AuthN | GET | `/reading-activity/insights` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 9 | AuthN | GET | `/notifications/unread-count` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 10 | AuthN | GET | `/import/covers-status` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 11 | AuthN | GET | `/journals/entry/1` | none | - | 401 | 404 | INFO | {"detail":"Not Found"} |
| 12 | AuthN | GET | `/notes/167/comments` | none | - | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 13 | AuthN | GET | `/profile/me` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 14 | AuthN | GET | `/userbooks/` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 15 | AuthN | GET | `/notes/me` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 16 | AuthN | GET | `/books/recommendations` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 17 | AuthN | GET | `/follow/following` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 18 | AuthN | GET | `/groups/my` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 19 | AuthN | GET | `/users/following` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 20 | AuthN | GET | `/reading-activity/insights` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 21 | AuthN | GET | `/notifications/unread-count` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 22 | AuthN | GET | `/import/covers-status` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 23 | AuthN | GET | `/journals/entry/1` | garbage | - | 401 | 404 | INFO | {"detail":"Not Found"} |
| 24 | AuthN | GET | `/notes/167/comments` | garbage | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 25 | AuthN | GET | `/profile/me` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 26 | AuthN | GET | `/userbooks/` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 27 | AuthN | GET | `/notes/me` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 28 | AuthN | GET | `/books/recommendations` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 29 | AuthN | GET | `/follow/following` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 30 | AuthN | GET | `/groups/my` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 31 | AuthN | GET | `/users/following` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 32 | AuthN | GET | `/reading-activity/insights` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 33 | AuthN | GET | `/notifications/unread-count` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 34 | AuthN | GET | `/import/covers-status` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 35 | AuthN | GET | `/journals/entry/1` | alg_none | - | 401 | 404 | INFO | {"detail":"Not Found"} |
| 36 | AuthN | GET | `/notes/167/comments` | alg_none | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 37 | AuthN | GET | `/profile/me` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 38 | AuthN | GET | `/userbooks/` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 39 | AuthN | GET | `/notes/me` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 40 | AuthN | GET | `/books/recommendations` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 41 | AuthN | GET | `/follow/following` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 42 | AuthN | GET | `/groups/my` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 43 | AuthN | GET | `/users/following` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 44 | AuthN | GET | `/reading-activity/insights` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 45 | AuthN | GET | `/notifications/unread-count` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 46 | AuthN | GET | `/import/covers-status` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 47 | AuthN | GET | `/journals/entry/1` | wrongkey | - | 401 | 404 | INFO | {"detail":"Not Found"} |
| 48 | AuthN | GET | `/notes/167/comments` | wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 49 | AuthN | GET | `/profile/me` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 50 | AuthN | GET | `/userbooks/` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 51 | AuthN | GET | `/notes/me` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 52 | AuthN | GET | `/books/recommendations` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 53 | AuthN | GET | `/follow/following` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 54 | AuthN | GET | `/groups/my` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 55 | AuthN | GET | `/users/following` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 56 | AuthN | GET | `/reading-activity/insights` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 57 | AuthN | GET | `/notifications/unread-count` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 58 | AuthN | GET | `/import/covers-status` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 59 | AuthN | GET | `/journals/entry/1` | sub_nonexistent | - | 401 | 404 | INFO | {"detail":"Not Found"} |
| 60 | AuthN | GET | `/notes/167/comments` | sub_nonexistent | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 61 | AuthN | GET | `/profile/me` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 62 | AuthN | GET | `/userbooks/` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 63 | AuthN | GET | `/notes/me` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 64 | AuthN | GET | `/books/recommendations` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 65 | AuthN | GET | `/follow/following` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 66 | AuthN | GET | `/groups/my` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 67 | AuthN | GET | `/users/following` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 68 | AuthN | GET | `/reading-activity/insights` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 69 | AuthN | GET | `/notifications/unread-count` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 70 | AuthN | GET | `/import/covers-status` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 71 | AuthN | GET | `/journals/entry/1` | expired_wrongkey | - | 401 | 404 | INFO | {"detail":"Not Found"} |
| 72 | AuthN | GET | `/notes/167/comments` | expired_wrongkey | - | 401 | 401 | PASS | {"detail":"Invalid authentication credentials"} |
| 73 | AuthN | GET | `/profile/me` | valid/bearer | casing | 200 | 200 | PASS | {"id":110,"name":"Review.Reader","username":"review.reader","email":"review.reader@trackmyread.com","bio":null,"profile_picture":null,"yearly_goal":1000000000,"created_at":"2026-09 |
| 74 | AuthN | GET | `/profile/me` | valid/BEARER | casing | 200 | 200 | PASS | {"id":110,"name":"Review.Reader","username":"review.reader","email":"review.reader@trackmyread.com","bio":null,"profile_picture":null,"yearly_goal":1000000000,"created_at":"2026-09 |
| 75 | AuthN | GET | `/profile/me` | valid/BeArEr | casing | 200 | 200 | PASS | {"id":110,"name":"Review.Reader","username":"review.reader","email":"review.reader@trackmyread.com","bio":null,"profile_picture":null,"yearly_goal":1000000000,"created_at":"2026-09 |
| 76 | AuthN | GET | `/profile/me` | valid/no-scheme | raw token no 'Bearer' | 401 | 401 | PASS | {"detail":"Not authenticated"} |
| 77 | AuthN | GET | `/admin/stats` | reader | non-admin | 403 | 403 | PASS | {"detail":"Admin access required"} |
| 78 | AuthN | POST | `/admin/push/broadcast` | reader | empty body, non-admin | 403 | 403 | PASS | {"detail":"Admin access required"} |
| 79 | IDOR | PUT | `/userbooks/881/progress` | reader→friend | {'current_page': 999} | 403/404 | 404 | PASS | {"detail":"UserBook not found"} |
| 80 | IDOR | PATCH | `/userbooks/881` | reader→friend | {'rating': 1, 'status': 'finished'} | 403/404 | 404 | PASS | {"detail":"UserBook not found"} |
| 81 | IDOR | DELETE | `/userbooks/881` | reader→friend | None | 403/404 | 404 | PASS | {"detail":"UserBook not found"} |
| 82 | IDOR | POST | `/userbooks/881/finish` | reader→friend | None | 403/404 | 404 | PASS | {"detail":"UserBook not found"} |
| 83 | IDOR | GET | `/userbooks/881` | reader→friend | None | 403/404 | 404 | PASS | {"detail":"Not found"} |
| 84 | IDOR | GET | `/notes/userbook/881` | reader→friend | None | 403/404 | 404 | PASS | {"detail":"UserBook not found"} |
| 85 | IDOR | GET | `/userbooks/881` | friend(verify) | re-read owner | row unchanged | 200 | PASS | {"id":881,"user_id":111,"book_id":844,"status":"to-read","current_page":0,"rating":null,"private_notes":null,"format":"hardcover","ownership_status":"owned","borrowed_from":null,"l |
| 86 | IDOR | PUT | `/notes/169` | reader→friend | edit note | 403 | 403 | PASS | {"detail":"Not authorized to edit this note"} |
| 87 | IDOR | DELETE | `/notes/169` | reader→friend | delete note | 403 | 403 | PASS | {"detail":"Not authorized to delete this note"} |
| 88 | IDOR | DELETE | `/groups/7/posts/5` | friend(non-curator)→reader post | delete | 403 | 403 | PASS | {"detail":"Not allowed"} |
| 89 | IDOR | POST | `/notes/204/comments` | reader→friend private note | comment on is_public=False note | 403/404 (should not be commentable) | 201 | FAIL | {"id":24,"text":"seen your private note","created_at":"2026-09-13T12:55:04.688921Z","user":{"id":110,"name":"Review.Reader"}} — likes_comments.create_comment does not check note.is |
| 90 | IDOR | POST | `/notes/204/like` | reader→friend private note | like on is_public=False note | 403/404 | 201 | FAIL | {"message":"Liked","liked":true} — likes_comments.like_note does not check note.is_public / author privacy |
| 91 | IDOR | GET | `/journals/entry/881` | reader | journals for friend's userbook | empty/own only | 404 | INFO | {"detail":"Not Found"} — journals.get_journals_for_entry has no user_id filter (dead route, table likely empty) |
| 92 | Validation | PATCH | `/userbooks/882` | reader | rating=-1 | 422 or clamp | 200 | INFO | {"id":882,"status":"to-read","current_page":0,"rating":-1,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — PATCH payload is an unvalidated dict → crud.update_use |
| 93 | Validation | PATCH | `/userbooks/882` | reader | rating=0 | 422 or clamp | 200 | PASS | {"id":882,"status":"to-read","current_page":0,"rating":0,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — PATCH payload is an unvalidated dict → crud.update_user |
| 94 | Validation | PATCH | `/userbooks/882` | reader | rating=6 | 422 or clamp | 200 | INFO | {"id":882,"status":"to-read","current_page":0,"rating":6,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — PATCH payload is an unvalidated dict → crud.update_user |
| 95 | Validation | PATCH | `/userbooks/882` | reader | rating=99 | 422 or clamp | 200 | INFO | {"id":882,"status":"to-read","current_page":0,"rating":99,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — PATCH payload is an unvalidated dict → crud.update_use |
| 96 | Validation | PATCH | `/userbooks/882` | reader | rating='abc' | 422 or clamp | 500 | FAIL | Internal Server Error — PATCH payload is an unvalidated dict → crud.update_userbook setattr |
| 97 | Validation | PATCH | `/userbooks/882` | reader | rating=4.5 | 422 or clamp | 200 | INFO | {"id":882,"status":"to-read","current_page":0,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — PATCH payload is an unvalidated dict → crud.update_user |
| 98 | Validation | PATCH | `/userbooks/882` | reader | status='banana' | 422/400 | 200 | INFO | {"id":882,"status":"banana","current_page":0,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} |
| 99 | Validation | PATCH | `/userbooks/882` | reader | current_page=-5 | 422/clamp | 200 | INFO | {"id":882,"status":"banana","current_page":-5,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — int column; a non-numeric string may 500 on PostgreSQL  |
| 100 | Validation | PATCH | `/userbooks/882` | reader | current_page=1000000000 | 422/clamp | 200 | INFO | {"id":882,"status":"banana","current_page":1000000000,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — int column; a non-numeric string may 500 on Pos |
| 101 | Validation | PATCH | `/userbooks/882` | reader | current_page='10' | 422/clamp | 200 | INFO | {"id":882,"status":"banana","current_page":10,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} — int column; a non-numeric string may 500 on PostgreSQL  |
| 102 | Validation | PATCH | `/userbooks/882` | reader | total_pages=0 | 422/clamp | 200 | INFO | {"id":882,"status":"banana","current_page":10,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":0} — PATCH total_pages writes the SHARED Book row (not just th |
| 103 | Validation | PATCH | `/userbooks/882` | reader | total_pages=-1 | 422/clamp | 200 | INFO | {"id":882,"status":"banana","current_page":10,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":-1} — PATCH total_pages writes the SHARED Book row (not just t |
| 104 | Validation | PATCH | `/userbooks/882` | reader | total_pages=1000000000 | 422/clamp | 200 | INFO | {"id":882,"status":"banana","current_page":10,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":1000000000} — PATCH total_pages writes the SHARED Book row (no |
| 105 | Validation | PATCH | `/userbooks/882` | reader | format='banana' | 422/400 | 200 | INFO | {"id":882,"status":"banana","current_page":10,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} |
| 106 | Validation | PATCH | `/userbooks/882` | reader | ownership_status='junk' | 422/400 | 200 | INFO | {"id":882,"status":"banana","current_page":10,"rating":5,"updated_at":"2026-09-13T12:55:15.189576","book_total_pages":239} |
| 107 | Validation | POST | `/notes/` | reader | text empty | 400 for empty; else 201 | 400 | PASS | {"detail":"Post must have text, a quote, or an image"} |
| 108 | Validation | POST | `/notes/` | reader | text whitespace | 400 for empty; else 201 | 400 | PASS | {"detail":"Post must have text, a quote, or an image"} |
| 109 | Validation | POST | `/notes/` | reader | text 100KB | 400 for empty; else 201 | 201 | PASS | {"id":205,"user_id":null,"text":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA |
| 110 | Validation | POST | `/notes/` | reader | text emoji | 400 for empty; else 201 | 201 | PASS | {"id":206,"user_id":null,"text":"📚🔥✨ reading","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote":null,"is_public":false,"created_at":"2026-09-13T12:55:59.062 |
| 111 | Validation | POST | `/notes/` | reader | text RTL | 400 for empty; else 201 | 201 | PASS | {"id":207,"user_id":null,"text":"مرحبا بالعالم","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote":null,"is_public":false,"created_at":"2026-09-13T12:56:00.9 |
| 112 | Validation | POST | `/notes/` | reader | text zero-width | 400 for empty; else 201 | 201 | PASS | {"id":208,"user_id":null,"text":"a​b​c","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote":null,"is_public":false,"created_at":"2026-09-13T12:56:02.732200Z", |
| 113 | Validation | POST | `/notes/` | reader | text script-tag | 400 for empty; else 201 | 201 | INFO | {"id":209,"user_id":null,"text":"<script>alert(1)</script>","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote":null,"is_public":false,"created_at":"2026-09-1 |
| 114 | Validation | POST | `/notes/` | reader | text js-url-image | 400 for empty; else 201 | 201 | INFO | {"id":210,"user_id":null,"text":"note","emotion":null,"page_number":null,"chapter":null,"image_url":"javascript:alert(1)","quote":null,"is_public":false,"created_at":"2026-09-13T12 |
| 115 | Validation | POST | `/notes/211/comments` | reader | empty comment | 400 | 400 | PASS | {"detail":"Comment text cannot be empty"} |
| 116 | Validation | POST | `/notes/211/comments` | reader | 100KB comment | 201 or 413 | 201 | INFO | {"id":25,"text":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC |
| 117 | Validation | POST | `/groups/` | reader | empty name | 400 for empty name; else 201 | 400 | PASS | {"detail":"Group name is required"} |
| 118 | Validation | POST | `/groups/` | reader | 10KB desc | 400 for empty name; else 201 | 201 | INFO | {"id":20,"name":"QA-adv-grp-desc","description":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD |
| 119 | Validation | POST | `/groups/` | reader | cover junk | 400 for empty name; else 201 | 201 | INFO | {"id":21,"name":"QA-adv-grp-cover","description":null,"is_private":false,"invite_code":"ZXhULF3yPCA","cover_preset":"not-a-preset","created_by":110,"creator_name":"Review.Reader"," |
| 120 | Validation | POST | `/groups/` | reader | goal_pages neg | 400 for empty name; else 201 | 201 | INFO | {"id":22,"name":"QA-adv-grp-goalneg","description":null,"is_private":false,"invite_code":"_R_haMozyTo","cover_preset":"teal","created_by":110,"creator_name":"Review.Reader","goal_p |
| 121 | Validation | POST | `/groups/` | reader | goal_period junk | 400 for empty name; else 201 | 201 | INFO | {"id":23,"name":"QA-adv-grp-period","description":null,"is_private":false,"invite_code":"adDSYH4mJ2k","cover_preset":"teal","created_by":110,"creator_name":"Review.Reader","goal_pa |
| 122 | Validation | GET | `/users/search` | reader | q percent | 200 | 200 | PASS | [{"id":3,"name":"sapna.singh330","username":null,"bio":null,"is_following":false,"follows_you":false,"is_mutual":false},{"id":5,"name":"Anushika B","username":null,"bio":"","is_fol |
| 123 | Validation | GET | `/users/search` | reader | q underscore | 200 | 200 | PASS | [{"id":3,"name":"sapna.singh330","username":null,"bio":null,"is_following":false,"follows_you":false,"is_mutual":false},{"id":5,"name":"Anushika B","username":null,"bio":"","is_fol |
| 124 | Validation | GET | `/users/search` | reader | q quotes | 200 | 200 | PASS | [] |
| 125 | Validation | GET | `/users/search` | reader | q 5KB | 200 | 200 | PASS | [] |
| 126 | Validation | GET | `/notes/feed` | reader | limit=0 | 422 or cap<=200 | 200 | PASS | [] — /books/ caps via Query(ge=1,le=200); /notes/* have no cap |
| 127 | Validation | GET | `/notes/feed` | reader | limit=-1 | 422 or cap<=200 | 500 | FAIL | Internal Server Error — /books/ caps via Query(ge=1,le=200); /notes/* have no cap |
| 128 | Validation | GET | `/notes/feed` | reader | limit=100000 | 422 or cap<=200 | 200 | INFO | [{"id":169,"user_id":111,"text":"A line from this book has been stuck in my head all week.","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote":"It is a truth |
| 129 | Validation | GET | `/notes/me` | reader | limit=0 | 422 or cap<=200 | 200 | PASS | [] — /books/ caps via Query(ge=1,le=200); /notes/* have no cap |
| 130 | Validation | GET | `/notes/me` | reader | limit=-1 | 422 or cap<=200 | 500 | FAIL | Internal Server Error — /books/ caps via Query(ge=1,le=200); /notes/* have no cap |
| 131 | Validation | GET | `/notes/me` | reader | limit=100000 | 422 or cap<=200 | 200 | INFO | [{"id":211,"user_id":110,"text":"comment target","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote":null,"is_public":false,"created_at":"2026-09-13T12:56:08. |
| 132 | Validation | GET | `/books/` | reader | limit=0 | 422 or cap<=200 | 422 | PASS | {"detail":[{"loc":["query","limit"],"msg":"ensure this value is greater than or equal to 1","type":"value_error.number.not_ge","ctx":{"limit_value":1}}]} — /books/ caps via Query(g |
| 133 | Validation | GET | `/books/` | reader | limit=-1 | 422 or cap<=200 | 422 | PASS | {"detail":[{"loc":["query","limit"],"msg":"ensure this value is greater than or equal to 1","type":"value_error.number.not_ge","ctx":{"limit_value":1}}]} — /books/ caps via Query(g |
| 134 | Validation | GET | `/books/` | reader | limit=100000 | 422 or cap<=200 | 422 | PASS | {"detail":[{"loc":["query","limit"],"msg":"ensure this value is less than or equal to 200","type":"value_error.number.not_le","ctx":{"limit_value":200}}]} — /books/ caps via Query( |
| 135 | Validation | GET | `/reading-activity/daily` | reader | days=0 (0.94s) | 200, bounded time | 200 | PASS | {"days":0,"data":[]} |
| 136 | Validation | GET | `/reading-activity/daily` | reader | days=-1 (0.94s) | 200, bounded time | 200 | PASS | {"days":-1,"data":[]} |
| 137 | Validation | GET | `/reading-activity/daily` | reader | days=100000 (2.47s) | 200, bounded time | 200 | PASS | {"days":100000,"data":[{"date":"1752-11-29","pages_read":0},{"date":"1752-11-30","pages_read":0},{"date":"1752-12-01","pages_read":0},{"date":"1752-12-02","pages_read":0},{"date":" |
| 138 | Validation | PATCH | `/notifications/prefs` | reader | valid 7-key payload | 200 | 500 | FAIL | Internal Server Error — write path — GET /prefs works but this PATCH 500s on every payload (endpoint broken) |
| 139 | Validation | PATCH | `/notifications/prefs` | reader | unknown extra key | 200 ignored | 500 | FAIL | Internal Server Error — same 500 as the valid payload — not caused by the extra key |
| 140 | Validation | PATCH | `/notifications/prefs` | reader | non-bool value | 422 | 422 | PASS | {"detail":[{"loc":["body","new_follower"],"msg":"value could not be parsed to a boolean","type":"type_error.bool"}]} |
| 141 | Validation | PUT | `/profile/me` | reader | name 10KB | 200 or 422 | 200 | INFO | {"id":110,"name":"NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN |
| 142 | Validation | PUT | `/profile/me` | reader | yearly_goal=-1 | 422/clamp | 200 | INFO | {"id":110,"name":"NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN |
| 143 | Validation | PUT | `/profile/me` | reader | yearly_goal=1000000000 | 422/clamp | 200 | INFO | {"id":110,"name":"NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN |
| 144 | State/race | POST | `/books/add-to-library` | reader x2 concurrent | same google_id; statuses=[200, 200] | 1 userbook row | 200 | FAIL | 2 userbook rows for this book — duplicate-guard is a check-then-insert, not a unique constraint |
| 145 | State/race | POST | `/notes/212/like` | reader x3 concurrent | like own note | likes_count==1 | 201 | FAIL | likes_count=3 — like has no unique(note_id,user_id); concurrent inserts can duplicate |
| 146 | State/race | POST | `/follow/111` | reader x2 concurrent | double follow; statuses=[200, 200] | 1 follow row | 200 | FAIL | 2 follow rows — follow has no unique constraint; concurrent inserts can duplicate |
| 147 | State/race | PUT | `/userbooks/856/progress` | reader | seed book to total then 0; total=292 | finished→to-read | 200 | PASS | status total-hit=finished, status after-0=to-read — book_completed fires to followers on the finished transition; book restored after |
| 148 | State/race | POST | `/groups/7/join` | friend | join twice | idempotent (already member) | 201 | PASS | {"status":"active","message":"Already a member or pending"} |
| 149 | State/race | DELETE | `/groups/7/leave` | reader(sole curator) | leave | 400 transfer-curator | 400 | PASS | {"detail":"Transfer curator role before leaving"} |
| 150 | State/race | GET | `/groups/my` | reader(verify) | still member of Circle | member | 200 | PASS | True |
| 151 | State/race | POST | `/groups/7/approve/111` | reader(curator) | approve already-active member | no-op / 200 | 200 | INFO | {"ok":true} — re-fires group_join_approved notification for an already-active member |
| 152 | State/race | DELETE | `/notes/213` | reader | delete note with like+comment | 200, FK-safe | 200 | PASS | {"message":"Note deleted successfully"} |
| 153 | State/race | DELETE | `/userbooks/885` | reader | delete userbook that still has a note | 200 (or cascade) | 200 | PASS | {"status":"ok","message":"Book removed from library successfully"} — userbooks_router.delete_userbook does not pre-delete dependent notes/reading_activity |
| 154 | State/race | GET | `/notes/214/comments` | reader(verify) | note after userbook delete | 404 if cascaded | 200 | INFO | [] |
| 155 | State/race | DELETE | `/userbooks/864` | reader | delete userbook that has reading_activit | 200 FK-safe | 500 | FAIL | Internal Server Error — delete_userbook does not pre-delete reading_activity; reading_activity.userbook_id FK blocks the delete → 500. LEFTOVER: userbook 864 (review.reader) cannot |
| 156 | Uploads | POST | `/notes/upload-image` | reader | text-as-png (image/png) | 400/500 (Cloudinary refuses non-images) | 500 | INFO | {"detail":"Failed to upload image: Invalid image file"} — url_issued=False |
| 157 | Uploads | POST | `/notes/upload-image` | reader | svg-with-script (image/svg+xml) | 400/500 (Cloudinary refuses non-images) | 500 | INFO | {"detail":"Failed to upload image: Zero-sized SVG is invalid"} — url_issued=False |
| 158 | Uploads | POST | `/notes/upload-image` | reader | zero-byte (image/png) | 400/500 (Cloudinary refuses non-images) | 500 | INFO | {"detail":"Failed to upload image: Missing required parameter - file"} — url_issued=False |
| 159 | Import | POST | `/import/goodreads` | friend | 5-row malformed CSV (missing cols, bad I | summary imported/skipped/failed, no 500 | 200 | PASS | {"imported": 3, "skipped": 1, "failed": 1, "total": 5, "errors": [{"row": 5, "reason": "Missing title"}]} |
| 160 | CORS/HTTP | OPTIONS | `/userbooks/` | none | Origin: https://evil.example | no ACAO for evil origin | 400 | PASS | ACAO=None |
| 161 | CORS/HTTP | DELETE | `/version` | none | wrong method | 405 | 405 | PASS | {"detail":"Method Not Allowed"} |
| 162 | CORS/HTTP | PUT | `/notes/feed` | reader | wrong method | 405 | 422 | INFO | {"detail":[{"loc":["path","note_id"],"msg":"value is not a valid integer","type":"type_error.integer"},{"loc":["body"],"msg":"field required","type":"value_error.missing"}]} |
| 163 | CORS/HTTP | GET | `/userbooks` | reader | trailing-slash redirect | 307 to https | 307 | INFO | Location='https://book-tracker-stitch.onrender.com/userbooks/' |
| 164 | CORS/HTTP | GET | `/uploads/` | none | directory listing | 404/no listing | 404 | PASS | {"detail":"Not Found"} |
| 165 | CORS/HTTP | GET | `/uploads/..%2f..%2fapp/main.py` | none | path traversal | 404, no file | 400 | PASS | <html> <head><title>400 Bad Request</title></head> <body> <center><h1>400 Bad Request</h1></center> <hr><center>cloudflare</center> </body> </html>  |
| 166 | CORS/HTTP | GET | `/version` | none | security headers | HSTS/XFO/XCTO/CSP present | 200 | INFO | present=[] missing=['strict-transport-security', 'x-frame-options', 'x-content-type-options', 'content-security-policy', 'referrer-policy'] — Render may add HSTS at the edge; app s |
| 167 | Public | GET | `/api/googlebooks/search` | none | unauth max_results=40 start_index=999999 | 200 | 500 | FAIL | {"detail":"Unexpected error: "} |
| 168 | Public | GET | `/notifications/vapid-public-key` | none | unauth | 200 key or 503 | 200 | PASS | {"public_key":"BE6n6jg0vUczMfJ27Zhfa375VWz4ibMJSy3yt4PpjX1ZW4D2Zt6X16AQkeljY2ZAmiJihgjLZ86CfvAo3-lb_tc"} |
| 169 | Public | POST | `/auth/delete-account` | none | email=review.reader@trackmyread.com | already flagged in a prior run — NOT repeated | None | INFO | not run (already flagged; not repeated per task) — Prior run set deletion_requested_at on review.reader (110). Skipped to avoid repeating. |
| 170 | Privacy | PUT | `/profile/me` | friend | set is_private_profile=true | 200 private | 200 | PASS | {"id":111,"name":"Review.Friend","username":"review.friend","email":"review.friend@trackmyread.com","bio":null,"profile_picture":null,"yearly_goal":null,"created_at":"2026-09-13T11 |
| 171 | Privacy | GET | `/profile/111` | reader (still follows friend) | profile | follower access; community feed excludes private author | 200 | INFO | friend_present=True — visible to reader as a retained follower (expected) |
| 172 | Privacy | GET | `/userbooks/user/111` | reader (still follows friend) | books | follower access; community feed excludes private author | 200 | INFO | friend_present=False — not present |
| 173 | Privacy | GET | `/notes/user/111` | reader (still follows friend) | notes | follower access; community feed excludes private author | 200 | INFO | friend_present=False — not present |
| 174 | Privacy | GET | `/users/111/stats` | reader (still follows friend) | stats | follower access; community feed excludes private author | 200 | INFO | friend_present=False — not present |
| 175 | Privacy | GET | `/reading-activity/user/111/daily` | reader (still follows friend) | activity | follower access; community feed excludes private author | 200 | INFO | friend_present=False — not present |
| 176 | Privacy | GET | `/users/search?q=review.friend` | reader (still follows friend) | search | follower access; community feed excludes private author | 200 | INFO | friend_present=True — private profile is returned by /users/search (id/name/username/bio). Design choice — recorded as INFO. |
| 177 | Privacy | GET | `/books/recommendations` | reader (still follows friend) | recommendations | follower access; community feed excludes private author | 200 | INFO | friend_present=False — not present |
| 178 | Privacy | GET | `/userbooks/friends/currently-reading` | reader (still follows friend) | friends-currently-reading | follower access; community feed excludes private author | 200 | INFO | friend_present=True — visible to reader as a retained follower (expected) |
| 179 | Privacy | GET | `/notes/feed` | reader (still follows friend) | community-feed | follower access; community feed excludes private author | 200 | PASS | friend_present=False — private author correctly excluded |
| 180 | Privacy | GET | `/notes/friends-feed` | reader (still follows friend) | friends-feed | follower access; community feed excludes private author | 200 | INFO | friend_present=True — visible to reader as a retained follower (expected) |
| 181 | Privacy | GET | `/notes/169/comments` | reader (follows) | read comments on private friend's note | 200 (follower) | 200 | PASS | [] |
| 182 | Privacy | GET | `/groups/7/leaderboard` | reader (member) | leaderboard | members see each other (group scope, unaffected by profile privacy) | 200 | INFO | friend_present=False |
| 183 | Privacy | GET | `/groups/7/members` | reader (member) | members | members see each other (group scope, unaffected by profile privacy) | 200 | INFO | friend_present=False |
| 184 | Privacy | GET | `/groups/7/activity` | reader (member) | activity | members see each other (group scope, unaffected by profile privacy) | 200 | INFO | friend_present=False |
| 185 | Privacy | PUT | `/profile/me` | friend(restore) | un-private + re-follow reader | private=false, friend→reader follow restored | 200 | PASS | private_restored=True, refollowed=True |
| 186 | Cleanup | - | `-` | - | assert no QA notes remain | 0 remaining | None | PASS | remaining_qa_notes=[] |
| 187 | Cleanup | - | `-` | - | created vs cleaned | created 20 | None | PASS | created 20 / cleaned 20 / uncleaned [] |