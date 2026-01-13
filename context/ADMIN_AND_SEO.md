# Admin Dashboard & SEO Pages Context

**Last Updated:** January 13, 2026  
**Features:** Admin Dashboard, SEO Landing Pages

---

## Overview

Two major feature additions:
1. **Admin Dashboard** - Platform statistics and user management
2. **SEO Pages** - About, Privacy, Terms, Help, Contact pages for Google indexing

---

## Admin Dashboard

### Purpose
Provide platform administrators with insights into:
- Total users, books, and follows
- Recent user activity (with last active tracking)
- Book catalog (with user attribution)
- Network/follow relationships

### Access Control
- `is_admin` boolean flag on user table
- `get_admin_user()` dependency in `app/deps.py`
- Returns 403 Forbidden for non-admin users
- Admin user: ankitalkuhs@gmail.com

### Files

**Backend:**
- `app/routers/admin_router.py` - All admin endpoints
- `app/deps.py` - Admin authentication dependency
- `app/models.py` - Added is_admin and last_active to User model
- `migrations/add_is_admin.py` - Migration for admin column
- `migrations/add_last_active.py` - Migration for tracking column

**Frontend:**
- `book-tracker-frontend/src/pages/AdminPage.jsx` - Full dashboard UI

### API Endpoints

#### GET `/admin/stats`
Returns platform-wide statistics:
```json
{
  "total_users": 150,
  "total_books": 1234,
  "total_follows": 456
}
```

#### GET `/admin/users`
Returns all users with details:
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "is_admin": false,
    "last_active": "2026-01-13T10:30:00",
    "created_at": "2026-01-01T00:00:00"
  }
]
```

#### GET `/admin/books`
Returns all books with user attribution:
```json
[
  {
    "id": 1,
    "title": "1984",
    "authors": "George Orwell",
    "added_by_users": "Alice, Bob, Charlie"
  }
]
```

#### GET `/admin/follows`
Returns follow relationships:
```json
[
  {
    "follower_name": "Alice",
    "follower_email": "alice@example.com",
    "following_name": "Bob",
    "following_email": "bob@example.com",
    "created_at": "2026-01-10T12:00:00"
  }
]
```

#### POST `/admin/set-admin/{user_id}`
Sets/unsets admin status for a user (admin only).

### UI Features

**AdminPage.jsx:**
- Tab navigation: Stats, Users, Books, Network
- Stats: Big number cards with totals
- Users table: Name, Email, Admin status, Last Active, Actions
- Books table: Title, Authors, Added By (comma-separated users)
- Network table: Follower → Following relationships
- Responsive design with modern styling

### Database Changes

**User table additions:**
```sql
ALTER TABLE "user" ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN last_active TIMESTAMP;
```

### Last Active Tracking

**How it works:**
- Updated in `/auth/google` endpoint on login
- Only updates if date has changed (not multiple times per day)
- Shows "Never" if NULL in admin dashboard
- Populated on next login after migration

**Code:**
```python
from datetime import datetime, date

today = date.today()
if user.last_active is None or user.last_active.date() != today:
    user.last_active = datetime.utcnow()
    db.commit()
```

---

## SEO Pages

### Purpose
Improve Google indexing and SEO by providing:
- Information pages (About, Help, Contact)
- Legal pages (Privacy, Terms)
- Footer navigation across all pages

### Routing Strategy
- Hash-based URLs: `#/about`, `#/privacy`, `#/terms`, `#/help`, `#/contact`
- App.jsx listens to `hashchange` event
- `navigateToRoute()` function syncs state with URL hash
- Initial route loaded from `window.location.hash`

### Files

**Pages:**
- `book-tracker-frontend/src/pages/AboutPage.jsx` - Landing page with features
- `book-tracker-frontend/src/pages/PrivacyPage.jsx` - Privacy policy (12 sections)
- `book-tracker-frontend/src/pages/TermsPage.jsx` - Terms of service (14 sections)
- `book-tracker-frontend/src/pages/HelpPage.jsx` - FAQ with accordion UI
- `book-tracker-frontend/src/pages/ContactPage.jsx` - Email contact info

**Shared Components:**
- `book-tracker-frontend/src/components/shared/Footer.jsx` - Site footer
- `book-tracker-frontend/src/components/shared/ModernHeader.jsx` - Updated with About link

**Routing:**
- `book-tracker-frontend/src/App.jsx` - Route configuration and hash handling

### Page Details

#### AboutPage
- Hero section with CTA
- 6 feature cards (Organize, Share, Connect, Track, Discover, Goals)
- How It Works (4 steps)
- Bottom CTA with signup button
- All buttons navigate to login (merged signup)

#### PrivacyPage
- Complete privacy policy template
- 12 sections covering GDPR requirements
- Data collection, usage, sharing, security, user rights
- Contact email for privacy inquiries

#### TermsPage
- Full terms of service
- 14 sections covering legal requirements
- Account terms, content policy, acceptable use, IP, disclaimers, liability
- Last updated date

#### HelpPage
- Interactive FAQ with collapsible sections
- 20+ questions across categories:
  - Getting Started
  - Managing Books
  - Social Features
  - Reading Stats
  - Privacy & Security
  - Troubleshooting
- FAQItem component with toggle state

#### ContactPage
- Email contact: ankitalkuhs@gmail.com
- 3 info cards: Help, Bug Reports, Feature Requests
- "View FAQ" links to help page
- Email links for bug/feature requests
- Response time notice (24-48 hours)

### Footer Component

**Structure:**
- 4 columns: About, Quick Links, Legal, Features
- About: Brand info and tagline
- Quick Links: About, Help & FAQ, Contact Us
- Legal: Privacy Policy, Terms of Service
- Features: Static list of app features

**Navigation:**
- All links use proper `#/route` URLs (not onclick)
- SEO-friendly anchor tags
- Hover effects for UX
- Responsive grid layout

**Implementation:**
```jsx
<FooterLink route="about">About</FooterLink>
// Renders: <a href="#/about">About</a>
```

### URL Routing Implementation

**App.jsx changes:**
1. Initialize route from URL hash:
```javascript
const [route, setRoute] = useState(() => {
  const hash = window.location.hash.slice(2);
  return hash || "home";
});
```

2. Listen for hash changes:
```javascript
useEffect(() => {
  const handleHashChange = () => {
    const hash = window.location.hash.slice(2);
    if (hash) setRoute(hash);
  };
  window.addEventListener('hashchange', handleHashChange);
  return () => window.removeEventListener('hashchange', handleHashChange);
}, []);
```

3. Update hash when navigating:
```javascript
const navigateToRoute = (newRoute) => {
  window.location.hash = `#/${newRoute}`;
  setRoute(newRoute);
};
```

### SEO Benefits

✅ Each page has unique, shareable URL  
✅ Users can bookmark specific pages  
✅ Search engines can index individual pages  
✅ Browser back/forward buttons work  
✅ Footer provides internal linking  
✅ Privacy/Terms pages build trust  
✅ About page explains value proposition  
✅ Help/FAQ reduces support load  

---

## Design Decisions

### Why Hash Routing?
- Works with Vercel static hosting
- No server-side routing configuration needed
- Client-side navigation is instant
- SEO-friendly when combined with proper URLs

### Why Single Sign In?
- Google OAuth handles both signup and login
- Simpler UX (one button instead of two)
- Modern pattern (Notion, Linear, etc.)
- No confusion about which button to click

### Why Footer on Modern Pages Only?
- Legacy pages use old layout with Sidebar
- Modern pages have cleaner, full-width design
- Footer provides consistent navigation
- `isModernPage` check controls display

### Why Admin Dashboard Tabs?
- Large datasets need organization
- Tab pattern is familiar to users
- Allows focused views per data type
- Easy to add new tabs in future

---

## Future Enhancements

### SEO
- [ ] Add sitemap.xml
- [ ] Add robots.txt
- [ ] Implement meta tags (title, description, Open Graph)
- [ ] Create public book pages (/books/[id])
- [ ] Add Schema.org markup
- [ ] Build discover/trending page

### Admin
- [ ] Add user search/filter
- [ ] Export data to CSV
- [ ] Ban/suspend users
- [ ] Delete inappropriate content
- [ ] View user activity logs
- [ ] Platform analytics graphs

### Auth
- [ ] Add logout all devices
- [ ] Show active sessions
- [ ] Email notifications on new login
- [ ] Rate limiting on auth endpoints

---

## Testing Checklist

**Admin Dashboard:**
- [x] Only admin users can access /admin route
- [x] Stats show correct totals
- [x] Users table displays all users
- [x] Last Active updates on login
- [x] Books table shows user attribution
- [x] Network table shows follows

**SEO Pages:**
- [x] All pages accessible via URLs
- [x] Footer links navigate correctly
- [x] About link in header works
- [x] Get Started buttons go to login
- [x] Contact email links work
- [x] FAQ accordion toggles work
- [x] Browser back/forward buttons work
- [x] URLs update in address bar

**Navigation:**
- [x] Hash routing loads correct page on refresh
- [x] All internal links update URL
- [x] External links (mailto:) work
- [x] Footer appears on modern pages only
- [x] Header shows About link

