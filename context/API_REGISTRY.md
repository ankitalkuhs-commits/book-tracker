# API Registry

Tracks which endpoints are used by which client and any new endpoints added
during the stitch-experiment. Update this file in the same commit whenever
an endpoint is added or modified.

---

## Rules
- Never modify existing endpoint behaviour — mobile depends on it
- Additive changes to responses (new optional fields) are safe for all clients
- New endpoints go in new router files — never edit existing router files
- Document every new endpoint here before building the frontend page that uses it

---

## New Endpoints Added for Stitch Experiment
| Endpoint | Method | File | Reason | Safe for Mobile? |
|----------|--------|------|--------|-----------------|
| (none yet) | | | | |

---

## Existing Endpoints Used by Stitch Frontend

### Auth
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/auth/google` | POST | all clients | unchanged |
| `/auth/demo-login` | POST | web, stitch | unchanged |
| `/auth/delete-account` | POST | stitch-web | unchanged |

### Books
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/books/` | GET | all clients | unchanged |
| `/books/{id}` | GET | all clients | unchanged |
| `/books/add-to-library` | POST | all clients | unchanged |

### User Books
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/userbooks/` | GET | all clients | unchanged |
| `/userbooks/` | POST | all clients | unchanged |
| `/userbooks/{id}/progress` | PUT | all clients | unchanged |
| `/userbooks/{id}/finish` | PUT | all clients | unchanged |
| `/userbooks/{id}` | DELETE | all clients | unchanged |
| `/userbooks/user/{user_id}` | GET | all clients | unchanged |
| `/userbooks/friends/currently-reading` | GET | all clients | unchanged |

### Notes / Posts
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/notes/feed` | GET | all clients | unchanged |
| `/notes/friends-feed` | GET | all clients | unchanged |
| `/notes/me` | GET | all clients | unchanged |
| `/notes/` | POST | all clients | unchanged |
| `/notes/upload-image` | POST | all clients | unchanged |
| `/notes/{id}` | PUT | all clients | unchanged |
| `/notes/{id}` | DELETE | all clients | unchanged |
| `/notes/userbook/{id}` | GET | all clients | unchanged |

### Follow
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/follow/{user_id}` | POST | all clients | unchanged |
| `/follow/{user_id}` | DELETE | all clients | unchanged |
| `/follow/followers` | GET | all clients | unchanged |
| `/follow/following` | GET | all clients | unchanged |

### Likes & Comments
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/{note_id}/like` | POST | all clients | unchanged |
| `/{note_id}/like` | DELETE | all clients | unchanged |
| `/{note_id}/comments` | POST | all clients | unchanged |
| `/{note_id}/comments` | GET | all clients | unchanged |

### Profiles
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/profile/me` | GET | all clients | unchanged |
| `/profile/me` | PUT | all clients | unchanged |
| `/profile/{user_id}` | GET | all clients | unchanged |

### Reading Activity
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/reading-activity/daily` | GET | all clients | unchanged |
| `/reading-activity/user/{id}/daily` | GET | all clients | unchanged |

### Notifications
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/notifications/vapid-public-key` | GET | web clients | unchanged |
| `/notifications/web-subscribe` | POST | web clients | unchanged |
| `/notifications/unread` | GET | all clients | unchanged |
| `/notifications/list` | GET | all clients | unchanged |
| `/notifications/{id}/read` | PUT | all clients | unchanged |

### Push Tokens
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/push-tokens/` | POST | all clients | unchanged |
| `/push-tokens/` | DELETE | all clients | unchanged |

### Users
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/users/search` | GET | all clients | unchanged |
| `/users/{id}/stats` | GET | all clients | unchanged |

### Google Books
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/googlebooks/search` | GET | all clients | unchanged |
| `/googlebooks/book/{id}` | GET | all clients | unchanged |

### Admin
| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/admin/stats` | GET | stitch-web, old-web | unchanged |
| `/admin/users` | GET | stitch-web, old-web | unchanged |
| `/admin/push/test/{id}` | POST | stitch-web, old-web | unchanged |
| `/admin/push/broadcast` | POST | stitch-web, old-web | known bug: fails for web push tokens |
