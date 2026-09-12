---
screen: [screen-name]
feature: [feature-name]
---

## Data Flow
[1–3 sentences. user action → api.js function → endpoint → table → response → UI update.]

## depends_on
- [feature/screen or API endpoint this screen needs]
- [e.g., features/auth (JWT via get_current_user)]
- [e.g., api: GET /userbooks/]

## depended_by
- [what breaks if this screen's API or data changes — check dependency-map.md]
- [none currently — if truly a leaf]

## API Endpoints Used
| Method | Path | Web api.js fn | Mobile api.js fn | Purpose |
|---|---|---|---|---|
| GET | /path | getX | xAPI.getX | [what it fetches] |

## DB Tables Touched
| Table | Operation | Ownership / privacy rule enforced |
|---|---|---|
| [table] | read / write | [e.g. userbook.user_id == me; is_private_profile follower gate] |

## Notifications Fired
| event_type | recipients | extra keys the template needs |
|---|---|---|
| [none] | | |

## Cross-Client Impact
[What changes here could affect the other client. Mobile changes need an EAS build + version bump in app.json.]
[If none: "No cross-client impact."]
