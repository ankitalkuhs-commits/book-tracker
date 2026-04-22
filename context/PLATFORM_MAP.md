# TrackMyRead — Platform Feature Map

> Last updated: April 19, 2026  
> Use this as the single source of truth for what the platform does.  
> Mermaid diagrams render in GitHub, Notion, and most markdown viewers.

---

## 1. Full Feature Map

```mermaid
mindmap
  root((TrackMyRead))
    Auth
      Google OAuth Login
      JWT Session Token
      First-time profile creation
      Account deletion
    Library
      Add Book
        Search Google Books API
        Set initial status
        Set format & ownership
      Track Progress
        Update current page
        Progress bar percentage
      Change Status
        Reading
        Want to Read
        Finished
      Rate Book
        1–5 stars
      Notes on a book
      Remove from Library
    Feed & Social
      Community Feed
        All public posts
      Friends Feed
        Posts from people I follow
      Like / Unlike a post
      Comment on a post
      Share a note
    Notes & Reflections
      Create note
        Tag a book optional
        Add a quote
        Upload an image
        Add emotion
      Edit own note
      Delete own note
    Social Graph
      Follow a user
      Unfollow a user
      View followers list
      View following list
      Search users by name or username
    User Profiles
      View own profile
      Edit name and bio
      Upload profile picture
      Privacy toggle
        Public profile
        Private profile locks from non-followers
      View reading stats
      View public notes
      View other users public profile
    Reading Activity
      Log pages read per day
      Weekly Pulse chart 7-day bar
      Reading Insights
        Reading velocity pages per day
        Projected finish date
        Books finished this year
        Total pages read
    Recommendations
      Friends currently reading
      Books friends rated 4+ stars
      Other books by authors I have read
    Groups Literary Circles
      Create group
        Name and description
        Public or private
        Set reading goal pages per month
        Invite members at creation
      Discover public groups
      Join a public group instantly
      Join by invite code
        Public group instant join
        Private group pending approval
      Curator actions
        Invite a specific member
        Approve join requests
        Reject join requests
        Remove a member
        Set group book
        Change group book
        Edit group settings
        Disband group
      Member actions
        Accept curator invite
        Decline curator invite
        Leave group
      Group Post Feed
        Create a post
        Attach book reference
        Delete own post
        Curator can delete any post
      Leaderboard
        Monthly ranking
        All-time ranking
        Ranked by pages read
        Ranked by books finished
        Shows current book per member
      Group Activity Feed
        Member joined
        Book started
        Book finished
        Milestone reached
        Note posted
        Group book changed
      Group Goal Progress
        Collective pages read
        Goal percentage complete
    Notifications
      Push Mobile
        Expo FCM Android
      Push Web
        VAPID via pywebpush
      In-App Notification Log
        Unread count badge
        History list
        Mark single read
        Mark all read
      Notification Preferences
        Toggle per event type
      Notification Types
        New follower
        Post liked
        Post commented
        Book added by following
    Admin Dashboard
      Platform stats
        Total users new this week and month
        Books and userbooks count
        Notes likes comments counts
      User management
        List all users
        Search and sort users
        Grant or revoke admin
      Book catalog view
        Most popular books
        Reading and completion counts
      Follow network view
      Push broadcast to all devices
      Editorial bot trigger NYT bestsellers
      Test push notification per user
```

---

## 2. User Journey — Onboarding to First Post

```mermaid
flowchart TD
    A([User opens app]) --> B[Login Page]
    B --> C[Sign in with Google]
    C --> D{First time?}
    D -- Yes --> E[Profile auto-created]
    D -- No --> F[Load existing profile]
    E --> G[Home Feed]
    F --> G

    G --> H[Search for a book]
    H --> I[Google Books results]
    I --> J[Add to Library\nset status + format]
    J --> K[Book in Library]

    K --> L[Open book in Library]
    L --> M[Update reading progress]
    L --> N[Write a Note / Reflection]
    N --> O{Make public?}
    O -- Yes --> P[Appears in Community Feed]
    O -- No --> Q[Saved privately]

    P --> R[Other users see post]
    R --> S[Like or Comment]
    S --> T[Notification sent to author]
```

---

## 3. User Journey — Groups Flow

```mermaid
flowchart TD
    A([User goes to Circles]) --> B{Action?}

    B --> C[Create a group]
    C --> D[Set name, privacy, goal]
    D --> E[Curator role assigned]
    E --> F[Invite members optional]
    F --> G[Invitees see pending invite]
    G --> H{Invitee accepts?}
    H -- Yes --> I[Joins as active member]
    H -- No --> J[Invite discarded]

    B --> K[Discover public groups]
    K --> L[Join directly]
    L --> I

    B --> M[Join by invite code]
    M --> N{Group private?}
    N -- No --> I
    N -- Yes --> O[Status: pending approval]
    O --> P[Curator sees join request]
    P --> Q{Curator decision}
    Q -- Approve --> I
    Q -- Reject --> R[Request removed]

    I --> S[Member is active]
    S --> T[Post in group feed]
    S --> U[View leaderboard]
    S --> V[See group activity feed]
    S --> W[Track group book progress]
```

---

## 4. Notification Routing

```mermaid
flowchart LR
    E[Event fired\nfire_event] --> D{dispatcher.py}

    D --> NL[(NotificationLog\nDB)]

    D --> PT{Push token type?}
    PT -- Expo token --> EX[Expo Push API\nFCM Android]
    PT -- Web subscription --> WP[pywebpush\nVAPID Web]

    EX --> M[📱 Mobile push]
    WP --> W[🌐 Browser push]

    NL --> APP[In-app bell\nunread count + history]

    subgraph Event Types
        F1[new_follower]
        F2[post_liked]
        F3[post_commented]
        F4[book_added]
        F5[group_activity]
    end
```

---

## 5. Architecture Overview

```mermaid
flowchart LR
    subgraph Clients
        WEB[Web App\nReact + Vite\nbook-tracker-frontend-stitch]
        MOB[Mobile App\nReact Native Expo\nbook-tracker-mobile]
    end

    subgraph Backend
        API[FastAPI\nbook-tracker-stitch.onrender.com]
        SCHED[APScheduler\nBackground Jobs]
    end

    subgraph Data
        DB[(Supabase\nPostgreSQL)]
        UPL[File Uploads\n/uploads static]
    end

    subgraph External
        GAUTH[Google OAuth 2.0]
        GBOOKS[Google Books API]
        EXPO[Expo Push API\nFCM]
        VAPID[VAPID\nWeb Push]
        NYT[NYT Books API\nEditorial Bot]
    end

    WEB --> API
    MOB --> API
    API --> DB
    API --> UPL
    API --> GAUTH
    API --> GBOOKS
    API --> EXPO
    API --> VAPID
    SCHED --> NYT
    SCHED --> API
```
