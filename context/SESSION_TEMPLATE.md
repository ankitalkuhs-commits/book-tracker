# Session Template: New Feature Development

**Date:** [Insert Date]  
**Feature:** [Feature Name]  
**Developer:** [Your Name]

---

## Session Start Checklist

Before starting development, review:
- [ ] Read `INDEX.md` - Understand project structure
- [ ] Read `PROJECT_CONTEXT.md` - Know current architecture
- [ ] Read relevant feature context in `/context/[feature]/`
- [ ] Check current git branch and status
- [ ] Verify local dev environment is running
- [ ] Review any open issues or TODOs

---

## Feature Context

### Goal
[What are we building? Why?]

### Affected Components
**Backend:**
- [ ] Models (database changes?)
- [ ] Routes (new endpoints?)
- [ ] Business logic (new services?)

**Frontend:**
- [ ] Pages (new routes?)
- [ ] Components (new UI elements?)
- [ ] State management (context/props changes?)

### Dependencies
- [ ] External APIs needed?
- [ ] New npm/pip packages?
- [ ] Environment variables required?

---

## Implementation Plan

### Step 1: [First Task]
**Files to modify:**
- `path/to/file1.js`
- `path/to/file2.py`

**Changes:**
- [ ] Add X feature
- [ ] Update Y component
- [ ] Test Z functionality

### Step 2: [Second Task]
...

---

## Testing Checklist

### Backend Tests
- [ ] API endpoint returns correct data
- [ ] Database changes applied correctly
- [ ] Error handling works
- [ ] Authentication/authorization enforced

### Frontend Tests
- [ ] UI renders correctly
- [ ] User interactions work
- [ ] Mobile responsive
- [ ] Loading and error states

### Integration Tests
- [ ] End-to-end flow works
- [ ] Data persists across refreshes
- [ ] Works in production environment

---

## Deployment Notes

### Database Changes
- [ ] Run migrations if needed
- [ ] Update models documentation
- [ ] Test on local SQLite first
- [ ] Verify on production PostgreSQL

### Environment Variables
New variables to add:
```
RENDER_BACKEND:
- VAR_NAME=value

VERCEL_FRONTEND:
- VITE_VAR_NAME=value
```

### Deployment Steps
1. [ ] Commit changes with clear message
2. [ ] Push to GitHub master branch
3. [ ] Monitor Render deployment logs
4. [ ] Monitor Vercel deployment logs
5. [ ] Test live site functionality
6. [ ] Rollback plan if issues found

---

## Session End Tasks

### Documentation Updates
- [ ] Update `INDEX.md` if structure changed
- [ ] Update `PROJECT_CONTEXT.md` if architecture changed
- [ ] Update feature-specific README in `/context/[feature]/`
- [ ] Add comments to complex code

### Code Cleanup
- [ ] Remove console.logs and debug code
- [ ] Format code consistently
- [ ] Remove unused imports
- [ ] Update comments

### Knowledge Transfer
- [ ] Document decisions made
- [ ] Note any gotchas or edge cases
- [ ] Update testing checklist
- [ ] Create next session's starting point

---

## Decisions Made This Session

1. **Decision:** [What was decided]
   - **Rationale:** [Why this approach]
   - **Alternatives Considered:** [Other options]
   - **Trade-offs:** [Pros/cons]

2. **Decision:** ...

---

## Issues Encountered

1. **Issue:** [What went wrong]
   - **Solution:** [How it was fixed]
   - **Prevention:** [How to avoid in future]

---

## Next Session Prompt

### What to Work On Next
[Brief description of what should be done in the next session]

### Context for Next Developer
- **Current State:** [What's working now]
- **Pending Work:** [What's incomplete]
- **Known Issues:** [Any bugs or limitations]
- **Suggested Approach:** [How to proceed]

### Files to Review First
1. `path/to/relevant/file1.js` - [Why important]
2. `path/to/relevant/file2.py` - [Why important]

---

## Time Tracking

- **Planning:** X minutes
- **Implementation:** Y minutes
- **Testing:** Z minutes
- **Documentation:** W minutes
- **Total:** T minutes

**Efficiency Notes:** [What went well? What slowed you down?]
