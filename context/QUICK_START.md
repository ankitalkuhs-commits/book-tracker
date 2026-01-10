# 🚀 Quick Start - Context System

**Welcome to the Book Tracker distributed memory system!**

This folder contains AI context documentation that makes working with Claude faster and more accurate.

---

## 📖 First Time Here?

**Read this in order:**

1. **[INDEX.md](INDEX.md)** ← Start here
   - Map of the entire project
   - Find any file or feature quickly
   
2. **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** ← Read this next
   - High-level architecture
   - Core design decisions
   - Tech stack overview

3. **Feature-specific READMEs** ← Then dive into what you're working on
   - [auth/](auth/) - Authentication
   - [library/](library/) - Book management  
   - [community/](community/) - Social features
   - [reading-stats/](reading-stats/) - Analytics
   - [deployment/](deployment/) - Infrastructure

---

## 🎯 Working with AI?

### Starting a Coding Session
```
You: "Read context/INDEX.md and context/auth/README.md. 
      I want to add password reset functionality."

AI: [Has full context of your auth system]
    [Suggests implementation matching your patterns]
```

### Better Approach: Use Session Templates
```
You: "Create a session start prompt for adding password reset to auth"

AI: [Creates filled template from session_prompts/SESSION_START_TEMPLATE.md]
    [Automatically knows which context files to read]
```

**See:** [session_prompts/HOW_TO_USE.md](session_prompts/HOW_TO_USE.md)

---

## 📁 What's in This Folder?

```
context/
├── INDEX.md                    # Map of everything
├── PROJECT_CONTEXT.md          # High-level architecture
├── QUICK_START.md             # This file
│
├── auth/
│   └── README.md              # Auth decisions & patterns
│
├── library/
│   └── README.md              # Book management docs
│
├── community/
│   └── README.md              # Social features docs
│
├── reading-stats/
│   └── README.md              # Analytics docs
│
├── deployment/
│   └── README.md              # Infrastructure docs
│
└── session_prompts/
    ├── HOW_TO_USE.md          # Session workflow guide
    ├── SESSION_START_TEMPLATE.md
    └── SESSION_END_TEMPLATE.md
```

---

## 💡 How to Use This System

### Scenario 1: "I want to add a new feature"
1. Check **INDEX.md** to find related features
2. Read that feature's **README.md** to understand patterns
3. Ask AI to implement following those patterns
4. Update the README with your changes

### Scenario 2: "Why did we build it this way?"
1. Check feature's **README.md** → "Key Design Decisions"
2. Find the decision with rationale
3. Decide if you want to change it

### Scenario 3: "Starting a new coding session"
1. Use **session_prompts/SESSION_START_TEMPLATE.md**
2. Fill in what you're working on
3. Share with AI
4. AI reads relevant context automatically

### Scenario 4: "Onboarding a new developer"
1. Have them read **PROJECT_CONTEXT.md**
2. Then **INDEX.md** to understand structure
3. Then specific feature READMEs as needed
4. They're up to speed in 30 minutes!

---

## 🎓 Key Concepts

### Feature-Based Organization
Instead of one giant context file, we organize by feature:
- **auth/** - Everything about authentication
- **library/** - Everything about books
- **community/** - Everything about social features

**Why?** Claude only reads what it needs. Faster, more accurate responses.

### Self-Updating Documentation
At the end of each session, AI helps you:
1. Summarize what was built
2. Document decisions made
3. Update relevant README files

**Why?** Context stays fresh automatically.

### Session Templates
Structured prompts that give AI all the context it needs:
- What you're working on
- What files matter
- What patterns to follow

**Why?** No more re-explaining your project every session.

---

## 🔄 Maintenance

### When to Update Context Files

**Update PROJECT_CONTEXT.md when:**
- Switching frameworks
- Major architecture changes
- New core design principles

**Update Feature READMEs when:**
- Adding new endpoints
- Changing data models
- Making design decisions
- Adding new patterns

**Update INDEX.md when:**
- Creating new features
- Reorganizing files
- Adding new context areas

### How Often?
**At the end of each coding session** (using SESSION_END_TEMPLATE)

---

## 🆘 Troubleshooting

### "AI doesn't know about my recent changes"
→ Update the relevant context README

### "AI is suggesting wrong patterns"
→ Check if the context README is outdated
→ Update it with correct patterns

### "Where do I find X?"
→ Start with INDEX.md
→ Use the quick links at the bottom

### "Context file is too long"
→ That's okay! AI reads what it needs
→ But consider splitting into subsections

---

## 🎯 Quick Links

| Working On... | Read This |
|--------------|-----------|
| Login/Signup | [auth/README.md](auth/README.md) |
| Books & Reading Lists | [library/README.md](library/README.md) |
| Social Features | [community/README.md](community/README.md) |
| Stats & Analytics | [reading-stats/README.md](reading-stats/README.md) |
| Deploy/Database | [deployment/README.md](deployment/README.md) |
| Overall Architecture | [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) |
| Find Anything | [INDEX.md](INDEX.md) |

---

## 📈 Benefits You'll See

### Week 1
- Faster AI responses
- More accurate suggestions
- Less context re-explaining

### Week 2
- Consistent code patterns
- Better decision documentation
- Easier to pick up where you left off

### Month 1
- New developers onboard faster
- "Why did we do this?" questions answered instantly
- No forgotten decisions

---

## 🚀 Get Started Now

**Absolute beginner?**
1. Read [INDEX.md](INDEX.md) (5 min)
2. Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) (10 min)
3. Try one session with [session_prompts/](session_prompts/) (15 min)

**Already coding?**
1. Open the feature README you're working on
2. Use it to give AI context
3. Update it when you make changes

**Want maximum efficiency?**
1. Read [session_prompts/HOW_TO_USE.md](session_prompts/HOW_TO_USE.md)
2. Use templates for every session
3. Keep context files updated

---

## 🤔 Questions?

This system is inspired by distributed memory patterns for AI coding sessions. The goal is simple:

> **Instead of Claude forgetting everything each session,  
> it reads exactly what it needs from organized context files.**

Try it for one week. You'll wonder how you worked without it.

---

**Ready?** Start with [INDEX.md](INDEX.md) →
