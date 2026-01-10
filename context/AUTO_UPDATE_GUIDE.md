# 🤖 Auto-Update Instructions for Claude

**When user says "wrap up", follow this automated workflow:**

---

## Step 1: Analyze Changes (Automatic)

Detect what was modified this session:
- Which files were created/edited/deleted?
- Which feature area? (auth, library, community, stats, deployment)
- Were any architectural decisions made?
- Were new endpoints/components added?

---

## Step 2: Update Feature README (If Applicable)

**If we worked on a feature:**

Read the current feature README:
- `context/auth/README.md` (if auth work)
- `context/library/README.md` (if library work)
- `context/community/README.md` (if community work)
- `context/reading-stats/README.md` (if stats work)
- `context/deployment/README.md` (if deploy work)

**Then update it with:**
- New API endpoints added
- New design decisions made
- New files created
- Modified patterns
- Known issues discovered
- Future enhancements identified

---

## Step 3: Update INDEX.md (If New Files)

**If new files were created:**

Add them to the appropriate section in `context/INDEX.md`:
- New routes → Add to feature's file list
- New components → Add to frontend section
- New migrations → Add to deployment section

---

## Step 4: Update PROJECT_CONTEXT.md (If Architecture Changed)

**Only if major changes:**
- Switched database/framework
- Changed authentication approach
- Modified core architecture
- Added new major technology

**Skip if:** Just adding endpoints, components, or features

---

## Step 5: Create Next Session Prompt

Generate a new session start file:

**Filename:** `context/session_prompts/SESSION_NEXT_{DATE}.md`

**Include:**
- Summary of what was accomplished
- What's ready to work on next
- Relevant context files to read
- Any blockers or questions

---

## Step 6: Generate Human Summary

Create a concise summary for the user:

```markdown
## Session Complete! ✅

### What We Built:
- [List main accomplishments]

### Files Changed:
- [Key files with brief description]

### Context Updated:
- ✅ Updated: context/[feature]/README.md
- ✅ Updated: context/INDEX.md (if needed)
- ✅ Created: Next session prompt

### Next Time:
Start with: "Read context/session_prompts/SESSION_NEXT_{DATE}.md"

### Time Saved:
~[X] minutes of context re-explanation next session!
```

---

## Template to Follow

Use the structure from `context/session_prompts/SESSION_END_TEMPLATE.md` but automatically fill in:

- ✅ Files changed (from git diff or your knowledge)
- ✅ Decisions made (from conversation)
- ✅ Testing done (from what we tested)
- ✅ Known issues (from what we discovered)
- ✅ Next steps (logical continuation)

---

## Example Execution

**User says:** "wrap up"

**Claude responds:**
1. "Analyzing changes... worked on auth feature (added password reset)"
2. "Updating context/auth/README.md with password reset section..."
3. "Adding new files to INDEX.md..."
4. "Creating next session prompt..."
5. [Shows summary]

**Total time:** ~30 seconds  
**User time saved next session:** 15-30 minutes

---

## Key Principle

**Everything is automated except the actual coding work.**

The user should only need to say:
- "start session" (beginning)
- "wrap up" (end)

Everything else is handled automatically! 🚀
