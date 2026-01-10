# Session Start Template

**Session Date:** {DATE}  
**Working On:** {FEATURE_NAME}

---

## Quick Orientation

### What I'm Building Today
{BRIEF_DESCRIPTION_OF_TASK}

### Relevant Context Files
Read these first before starting work:

1. **Feature Context:** [context/{FEATURE}/README.md](../auth/README.md)
   - Contains decisions, patterns, and current implementation details
   
2. **Project Overview:** [context/PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)
   - High-level architecture and design principles

3. **Index:** [context/INDEX.md](../INDEX.md)
   - Map of all context files (if you need to find something)

---

## Previous Session Summary
{COPY_FROM_LAST_SESSION_END_TEMPLATE}

---

## Today's Goals

### Primary Task
- [ ] {MAIN_OBJECTIVE}

### Subtasks
- [ ] {SUBTASK_1}
- [ ] {SUBTASK_2}
- [ ] {SUBTASK_3}

### Success Criteria
- {WHAT_DONE_LOOKS_LIKE}
- {TESTING_APPROACH}

---

## Key Files for This Session

### Backend
- `{PATH_TO_FILE_1}` - {PURPOSE}
- `{PATH_TO_FILE_2}` - {PURPOSE}

### Frontend
- `{PATH_TO_FILE_3}` - {PURPOSE}
- `{PATH_TO_FILE_4}` - {PURPOSE}

### Database
- Tables: `{TABLE_NAMES}`
- Migrations: `{IF_NEEDED}`

---

## Important Constraints

### Don't Change
- {WHAT_TO_AVOID_TOUCHING}
- {EXISTING_PATTERNS_TO_FOLLOW}

### Follow These Patterns
- {CODE_STYLE_OR_ARCHITECTURE_NOTES}
- {TESTING_REQUIREMENTS}

---

## Session Notes
{TAKE_NOTES_AS_YOU_WORK}

### Decisions Made
- {RECORD_CHOICES_YOU_MAKE}

### Blockers Encountered
- {ANYTHING_THAT_STOPPED_PROGRESS}

### Questions for Later
- {THINGS_TO_REVISIT}

---

## Quick Reference

### Run Backend
```bash
cd C:\Users\sonal\Documents\projects\book-tracker
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

### Run Frontend
```bash
cd book-tracker-frontend
npm run dev
```

### Test Endpoint
```bash
# Swagger: http://127.0.0.1:8000/docs
# Frontend: http://localhost:5173
```

---

**Remember:** At the end of this session, use SESSION_END_TEMPLATE.md to document what was accomplished!
