# How to Use Session Templates

This guide explains how to use the session prompt system for efficient AI-assisted development.

---

## Overview

The session template system helps:
- **Start sessions faster** - No need to re-explain the project
- **Maintain context** - Build on previous work seamlessly
- **Document decisions** - Capture why things were done
- **Improve AI accuracy** - Relevant context = better suggestions

---

## Workflow

### 1️⃣ Starting a New Session

1. **Copy the START template**
   ```bash
   cp session_prompts/SESSION_START_TEMPLATE.md session_prompts/SESSION_2026_01_10.md
   ```

2. **Fill in the placeholders**
   - `{DATE}` - Today's date
   - `{FEATURE_NAME}` - What you're working on (auth, library, community, etc.)
   - `{BRIEF_DESCRIPTION_OF_TASK}` - What you want to accomplish
   - `{MAIN_OBJECTIVE}` - Primary goal
   - `{SUBTASK_1, 2, 3}` - Break down the work

3. **Share with AI**
   - Paste the filled template into chat
   - Or just say: "Read `session_prompts/SESSION_2026_01_10.md` and let's start"

4. **AI reads relevant context automatically**
   - The template tells AI which context files to read
   - AI loads feature-specific README
   - Work begins with full understanding

---

### 2️⃣ During the Session

**Take notes in the START template as you work:**
- Record decisions made
- Note blockers encountered
- Track questions for later

The AI will help you document as you go!

---

### 3️⃣ Ending a Session

1. **Tell AI to create END summary**
   ```
   "Use SESSION_END_TEMPLATE to summarize what we did today"
   ```

2. **AI will automatically:**
   - List all files changed
   - Document decisions made
   - Record testing done
   - Flag known issues
   - Suggest next steps

3. **Review and save**
   - AI creates filled template
   - Save as `SESSION_END_2026_01_10.md`
   - Commit to git (optional but helpful)

4. **Update context files if needed**
   - AI will identify which context READMEs need updates
   - AI will draft the updates
   - You approve and AI applies them

---

## Example Session Flow

### Monday Morning - Starting
```
You: "I want to add password reset functionality. 
      Create a session start prompt for this."

AI: [Creates filled SESSION_START template]
    - Feature: auth
    - Reads: context/auth/README.md
    - Lists: Files to modify
    - Plans: Implementation steps

You: "Let's begin"

AI: [Implements with full context of your auth patterns]
```

### Monday Evening - Ending
```
You: "Let's wrap up. Create session end summary."

AI: [Creates filled SESSION_END template]
    - ✅ Created reset_password endpoint
    - ✅ Added email sending
    - 📝 Modified: auth_router.py, email.py
    - 🔑 Decision: Used JWT tokens for reset links
    - 🚀 Next: Add frontend UI

You: [Reviews summary] "Good, now update the auth context"

AI: [Updates context/auth/README.md with password reset section]
```

---

## Best Practices

### ✅ Do This
- **Start every session with a template** - Even for small tasks
- **Fill in previous session summary** - Builds continuity
- **Be specific in goals** - "Add password reset" not "improve auth"
- **Update context files** - Keep them accurate
- **Save END templates** - Great for project history

### ❌ Avoid This
- **Skipping session start** - AI will have less context
- **Vague objectives** - "Fix stuff" won't help planning
- **Not documenting decisions** - You'll forget why things were done
- **Ignoring technical debt** - Note it in END template
- **Forgetting to update context** - Context becomes stale

---

## Session Naming Convention

```
SESSION_START_2026_01_10_auth.md
SESSION_END_2026_01_10_auth.md

SESSION_START_2026_01_11_library.md
SESSION_END_2026_01_11_library.md
```

**Format:** `SESSION_{START/END}_{DATE}_{FEATURE}.md`

---

## What to Put in Session Notes

### Good Session Notes
```markdown
## Session Notes

### Decisions Made
- Chose JWT over UUID for reset tokens (expires in 1 hour)
- Decided to send plain text emails for now, HTML later
- Password reset links expire after 1 use

### Blockers Encountered
- SMTP setup confusing, used Gmail for testing
- Need to research production email service

### Questions for Later
- Should we rate-limit reset requests?
- Add CAPTCHA to prevent abuse?
```

### Better Than Nothing
```markdown
## Session Notes
- Added password reset
- Works with email
- Need to test more
```

---

## Integration with Git

### Optional: Commit Session Logs
```bash
git add context/session_prompts/SESSION_END_2026_01_10.md
git commit -m "Session: Added password reset functionality"
```

**Benefits:**
- Track project evolution
- See what was worked on when
- Understand decision timeline

---

## Advanced: Session Chains

For multi-day features, chain sessions:

**Day 1 END:**
```markdown
## Next Session Prep
- Implement frontend for password reset
- Read context/auth/README.md (updated with backend changes)
```

**Day 2 START:**
```markdown
## Previous Session Summary
Completed backend for password reset. JWT tokens work,
email sending configured. Now need frontend UI.
```

This creates seamless continuity!

---

## Troubleshooting

### "AI doesn't seem to have context"
- Check you shared the START template
- Verify context files are up to date
- Explicitly ask AI to read specific context file

### "End summary is generic"
- Take better notes during session
- Be specific about what changed
- Document decisions as you make them

### "Context files are outdated"
- Use END template to identify updates needed
- Update context READMEs at end of session
- Review context files weekly

---

## Quick Command Reference

### Start Session
```bash
# Create new start file
cp session_prompts/SESSION_START_TEMPLATE.md session_prompts/SESSION_START_$(date +%Y_%m_%d).md

# Edit and fill in details
# Share with AI
```

### End Session
```bash
# Tell AI to create end summary
# AI fills SESSION_END_TEMPLATE
# Save to session_prompts/
```

### Update Context
```bash
# AI identifies which context files to update
# AI proposes changes
# You approve
# AI applies updates
```

---

## Why This Works

### Traditional Approach
- Week 1: "Add auth" → Long context explanation
- Week 2: "Add password reset" → Re-explain auth setup
- Week 3: "Why did we use JWT?" → Dig through code

### With Session Templates
- Week 1: SESSION_END documents JWT decision
- Week 2: SESSION_START reads auth context, knows JWT pattern
- Week 3: Check context/auth/README.md → Instant answer

**Result:** 15-30 minute time savings per session, better consistency, no forgotten decisions.

---

## Your Turn!

Try it now:
1. Copy SESSION_START_TEMPLATE.md
2. Fill in today's task
3. Share with AI
4. Experience the difference!

---

**Remember:** The templates are guides, not strict rules. Adapt them to your workflow!
