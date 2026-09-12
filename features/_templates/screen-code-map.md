---
screen: [screen-name]
feature: [feature-name]
last_verified: YYYY-MM-DD
---

## Web (book-tracker-frontend-stitch)
| What | File | Notes |
|---|---|---|
| Page component | src/pages/[Name].jsx | |
| Shared component | src/components/[Name].jsx | |
| API calls | src/services/api.js → [fn names] | |
| Route | src/App.jsx | |

## Mobile (book-tracker-mobile-stitch)
| What | File | Notes |
|---|---|---|
| Screen component | src/screens/[Name]Screen.js | |
| API calls | src/services/api.js → [group.fn] | |
| Navigator entry | src/navigation/AppNavigator.js | |
| Preload seed | App.js preloadData() key: [profile/library/feed/...] | |

## Backend (app/)
| What | File | Notes |
|---|---|---|
| Route handler | app/routers/[module].py → [function]() | |
| Model | app/models.py → [Class] | |
| Migration | context/supabase_migration.sql — [section] | run in Supabase BEFORE pushing models.py |
| Tests | tests/test_[module].py | |

## Notes
[Anything non-obvious about how the code is structured here.]
