# PM Playbook — TrackMyRead

> Your guide, not the agents'. Agent design: `AGENTS_DESIGN.md`. Prompts: `agents/`.

## Your 3 gates
1. **After PM Helper** — read `spec.md`. Does it match your intent? Approve or correct. Nothing moves until it says APPROVED.
2. **After Architect** — read only the *Risk Summary* at the top of `architecture.md`. Decide the product questions. Technical choices are not yours to approve.
3. **After Junior QA** — read the run section in `tests.md`. Each failure: real problem or acceptable? You decide what ships.

## Starting a feature
- **Vague idea** → "Run discovery. I'll describe a problem; ask one question at a time until you can write a spec."
- **Know what you want, involves a screen** → get a Stitch mock first (prompt formula in `agents/pm-helper.md`), then the spec.
- **Know exactly** → fill `features/_templates/screen-spec.md` yourself, hand to PM Helper for validation.

## Invoking an agent
Say: "Run the {Architect} on features/{feature}/{screen}." The session loads `agents/{name}.md` and spawns it with the model in the table. Parallel Builders (web + mobile) are fine **only if** their file sets are disjoint and they use per-repo temp filenames.

## The done-checklist rule
Write it before build. "I log in as Bob and open Alice's private profile → I see the locked view, not her books." If you cannot write what you will click, you do not know what you are building yet.

## Sprint
1–3 features + at least one Known Issue from `context/LOAD_ME_FIRST.md`. Mobile changes are not shipped until an EAS build with a bumped `versionCode` exists.

## Non-negotiables you enforce
- Migration in Supabase before `models.py` is pushed.
- No response-shape change without the consumers in `dependency-map.md` updated the same sprint.
- Doc Sync runs every sprint. No exceptions.
