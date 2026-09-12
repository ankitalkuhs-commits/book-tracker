---
screen: [screen-name]
feature: [feature-name]
repo: [api | web | mobile — which client(s) this screen lives in]
status: [planned | in-progress | built | tested | production | deprecated]
last_verified: YYYY-MM-DD
---

## What It Does
[1 paragraph. What the user sees and does. No implementation detail.]

## Appetite
Max complexity: [simple: 1–2d | medium: 3–5d | complex: 1–2w]
Not building: [explicit list of what is out of scope for this screen]

## Requirements
- [ ] [Requirement — user-facing, testable]
- [ ] Empty state handled
- [ ] Loading state handled (never a spinner if PreloadContext already has data — mobile)
- [ ] Error state handled (Render cold start ~30s is a normal error path, not an edge case)

## Screen States
| State | Trigger | What User Sees |
|---|---|---|
| loading | on mount / refetch | [skeleton / spinner] |
| empty | no data returned | [empty state UI] |
| error | API failure / timeout | [error message + retry] |
| default | data loaded | [normal view] |
| [other] | [trigger] | [description] |

## Parity
- [ ] Web (`book-tracker-frontend-stitch/src/pages/...`)
- [ ] Mobile (`book-tracker-mobile-stitch/src/screens/...`)
- [ ] Deliberately web-only / mobile-only because: [reason]
