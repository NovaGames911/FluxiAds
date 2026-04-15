# FluxiAds — Ad Network Dashboard

## What is this project
FluxiAds is a personal ad network dashboard. The owner uploads video and image ad creatives,
organizes them into campaigns per game, and the system serves them via a public JSON URL.
Mobile games fetch that JSON URL to display ads. Think of it like a self-hosted AppLovin.

---

## Tech Stack
- **Frontend**: Pure HTML + CSS + Vanilla JS (no frameworks)
- **Styling**: Tailwind CSS via CDN + custom CSS
- **Font**: Space Grotesk via Google Fonts (bold, modern, techy feel)
- **Database + Auth + File Storage**: Supabase (free tier)
- **Hosting**: GitHub Pages (static files only)

---

## Design System — FOLLOW EXACTLY

### Personality
Epic, premium, dark SaaS. Think Linear.app meets a self-hosted ad network.
Bold typography. Confident spacing. Every element earns its place.
No generic AI slop. No safe neutrals. No boring cards.

### Color Palette
```
Background main:      #0a0a0f
Background card:      #12111a
Background surface:   #1c1a2e
Accent purple:        #7c3aed
Accent purple mid:    #8b5cf6
Accent purple light:  #a78bfa
Accent teal:          #06b6d4
Accent green:         #10b981
Accent red:           #ef4444
Text primary:         #f8fafc
Text secondary:       #94a3b8
Text muted:           #475569
Border default:       rgba(124,58,237,0.15)
Border hover:         rgba(124,58,237,0.35)
```

### Typography
- Font family: Space Grotesk (Google Fonts)
- Display headings: weight 600, letter-spacing -0.03em
- Section headings: weight 500
- Body: 14px, weight 400, line-height 1.6
- Labels: 11px, weight 500, letter-spacing 0.08em, uppercase
- Monospace (URLs, IDs): font-mono, color accent purple light

### UI Components
- **Cards**: bg #12111a, border 1px solid rgba(124,58,237,0.15), border-radius 16px, padding 20px
- **Card hover**: border-color rgba(124,58,237,0.35), subtle background shift
- **Button primary**: bg linear-gradient(135deg, #7c3aed, #6d28d9), color #fff, border-radius 10px, padding 9px 20px, font-weight 500
- **Button ghost**: bg transparent, border 1px solid rgba(124,58,237,0.3), color #a78bfa, border-radius 10px
- **Badge rewarded**: bg rgba(124,58,237,0.15), color #a78bfa, border-radius 20px, padding 3px 10px, font-size 11px
- **Badge interstitial**: bg rgba(6,182,212,0.12), color #06b6d4, border-radius 20px, padding 3px 10px, font-size 11px
- **Badge live**: bg rgba(16,185,129,0.12), color #10b981, border-radius 20px, padding 4px 10px, font-size 11px, with animated green dot
- **Toggle ON**: bg #7c3aed
- **Toggle OFF**: bg #1c1a2e, border 1px solid rgba(124,58,237,0.2)
- **Inputs**: bg #1c1a2e, border 1px solid rgba(124,58,237,0.2), color #f8fafc, border-radius 10px, padding 10px 14px, focus border #7c3aed
- **Sidebar**: bg #0d0c16, width 230px, border-right 1px solid rgba(124,58,237,0.12)
- **Scrollbar**: thin, thumb color #7c3aed, track transparent

### Animations
- Page load: fade in + slide up (0.3s ease)
- Card hover: scale(1.01) transition 0.2s
- Button hover: brightness(1.1) transition 0.15s
- Toggle: smooth slide 0.2s
- Stat numbers: count up animation on load
- Sidebar active item: smooth background transition

---

## Folder Structure
```
FluxiAds/
├── .claude/
│   └── commands/
│       ├── baseline-ui.md
│       ├── fixing-accessibility.md
│       └── fixing-motion-performance.md
├── index.html            # Login page
├── dashboard.html        # Main dashboard (requires login)
├── assets/
│   ├── css/
│   │   └── style.css     # Custom styles on top of Tailwind
│   └── js/
│       ├── supabase.js   # Supabase client init
│       ├── auth.js       # Login, logout, session check
│       ├── dashboard.js  # Load stats, switch games
│       ├── ads.js        # Create, read, update, delete ad packs
│       ├── upload.js     # Upload video/image to Supabase Storage
│       └── api.js        # Generate JSON + push to GitHub via API
├── api/
│   └── .gitkeep
└── CLAUDE.md
```

---

## Supabase Database Tables

Run this SQL in the Supabase SQL editor:

```sql
create table games (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text not null unique,
  created_at timestamp default now()
);

create table ads (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games(id) on delete cascade,
  name text not null,
  type text not null check (type in ('rewarded', 'interstitial')),
  video_url text,
  image_url text,
  click_url text not null,
  priority int default 1,
  mix_ads boolean default true,
  is_active boolean default true,
  impressions int default 0,
  clicks int default 0,
  created_at timestamp default now()
);

create table events (
  id uuid default gen_random_uuid() primary key,
  ad_id uuid references ads(id) on delete cascade,
  game_id uuid references games(id) on delete cascade,
  type text check (type in ('impression', 'click')),
  created_at timestamp default now()
);
```

Create a Supabase Storage bucket called `ad-creatives` set to public.
Enable Row Level Security. Add policy: authenticated users can do all operations.

---

## Page 1 — index.html (Login Page)

### Layout
Full screen. Background #0a0a0f.
Two column layout on desktop: left side is branding, right side is the login form.

### Left Side (branding panel) — bg #0d0c16, border-right rgba(124,58,237,0.12)
- Large logo: "Fluxi" white + "Ads" in gradient purple, font-size 42px, weight 600
- Tagline below: "Your games. Your ads. Your rules." — muted color, font-size 18px
- Below tagline: 3 feature points with small purple dot icons:
  - "Upload video & image creatives"
  - "Serve ads to any Unity game via JSON"
  - "Track impressions & clicks in real time"
- Bottom: version badge "v1.0 Beta" styled as a small pill

### Right Side (login form panel) — centered vertically
- Small logo at top: "FluxiAds" compact version
- Heading: "Welcome back" — font-size 28px, weight 600
- Subheading: "Sign in to your dashboard" — muted
- Email input (full width, labeled)
- Password input (full width, labeled, show/hide toggle)
- Login button (full width, primary style, text "Sign in")
- Error message area below button (hidden by default, red text inline)
- On submit: call Supabase signInWithPassword()
- On success: redirect to dashboard.html
- If already logged in: auto-redirect to dashboard.html

---

## Page 2 — dashboard.html (Main App)

### Sidebar (230px, fixed)
- Top: Logo "FluxiAds" + small "Beta" badge
- User avatar circle (initials) + email below logo
- Nav groups:
  - OVERVIEW: Dashboard, Analytics
  - CAMPAIGNS: Ad Packs, Creatives, Settings
- Bottom: GAMES section
  - Dynamic list from Supabase
  - Each game: colored dot + name, clickable
  - Active game: purple highlight
  - "+ Add Game" dashed button
  - Logout button at very bottom

### Top Bar
- Left: current game name (large) + "Ad campaign manager" subtitle
- Right: animated green "Live" badge + "Export JSON" ghost button + "+ New Ad" primary button

### Stats Row (4 cards)
- Impressions Today — purple accent
- Clicks Today — teal accent
- CTR % — green accent
- Active Ads — shows "X rewarded · Y interstitial"
All values from Supabase. Numbers animate counting up on load.

### Charts Row (2 columns, 60/40 split)
- Left: 7-day impressions bar chart — pure CSS flex bars, animated on load
- Right: rewarded vs interstitial donut — SVG stroke-dasharray, animated draw

### Ad Packs Table
- Columns: type thumb | name + URL | type badge | priority | active toggle | impressions | ··· menu
- Load from Supabase filtered by game_id
- Toggle updates Supabase + regenerates JSON
- ··· menu: Edit, Delete

### Unity Endpoint Card (bottom)
- Shows JSON URL for current game in monospace purple
- Copy button
- Animated green live dot

---

## New Ad Panel (slide-in from right)

Fields:
- Ad Name
- Type: Rewarded / Interstitial (styled toggle buttons)
- Video URL input OR upload button (rewarded only)
- Image URL input OR upload button
- Click URL (required)
- Priority (1–10)
- Mix Ads toggle

On Save:
1. Upload files to Supabase Storage if file selected
2. Insert into ads table
3. Call regenerateJSON(game_id)
4. Close panel, refresh table

---

## JSON Generation (api.js)

Regenerate on every ad create/update/toggle/delete.

### Output format:
```json
{
  "RewardedAds": {
    "mixAds": true,
    "mediaPacks": [
      {
        "id": "uuid",
        "videoURL": "https://...",
        "imageURL": "https://...",
        "webURL": "https://...",
        "priority": 1
      }
    ]
  },
  "InterstitialAds": {
    "mixAds": true,
    "mediaPacks": [
      {
        "id": "uuid",
        "imageURL": "https://...",
        "webURL": "https://...",
        "priority": 1
      }
    ]
  }
}
```

Only include ads where is_active = true.
Use ad UUID as the id field.

### Auto-push to GitHub:
```js
async function pushJsonToGitHub(slug, jsonContent) {
  const token = localStorage.getItem('github_token')
  const repo = localStorage.getItem('github_repo')
  const path = `api/${slug}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(jsonContent, null, 2))))
  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `token ${token}` }
  })
  const sha = getRes.ok ? (await getRes.json()).sha : undefined
  await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `update ads: ${slug}`,
      content,
      ...(sha && { sha })
    })
  })
}
```

---

## Tracking

Mobile games log events directly to Supabase REST:
```
POST https://{SUPABASE_URL}/rest/v1/events
Headers: apikey: {SUPABASE_ANON_KEY}, Content-Type: application/json
Body: { "ad_id": "uuid", "game_id": "uuid", "type": "impression" }
```

---

## Settings Page

Form inside dashboard (no separate page):
- Supabase URL
- Supabase Anon Key
- GitHub Personal Access Token
- GitHub Repo (e.g. novagames911/FluxiAds)

All saved to localStorage on submit.

---

## Skills — Use These At Every Step

Skills are installed globally. Use them in this exact order every time you build a page:

1. `/frontend-design` — run BEFORE writing any HTML. Pick bold aesthetic direction. No generic AI defaults.
2. Write the full page HTML/CSS/JS
3. `/baseline-ui` — run on the finished file. Fix spacing, typography, hover states.
4. `/fixing-accessibility` — fix keyboard nav, labels, focus rings.
5. `/fixing-motion-performance` — fix animation performance.

---

## Build Order

Build one step at a time. Do not move to next step until told to:

1. Create full folder structure (empty files)
2. assets/js/supabase.js — Supabase client from localStorage keys
3. index.html — login page (use /frontend-design first)
4. assets/js/auth.js — login, logout, session guard
5. dashboard.html — layout shell only (sidebar + topbar)
6. assets/css/style.css — custom CSS
7. assets/js/dashboard.js — load games, stats, game switching
8. assets/js/ads.js — ad packs table, toggle, delete
9. New Ad slide-in panel
10. assets/js/upload.js — Supabase Storage upload
11. assets/js/api.js — JSON generation + GitHub push
12. Settings view
13. Analytics view

---

## Rules
- Vanilla JS only — no React, no Vue, no Node
- No backend — Supabase REST + GitHub API only
- GitHub Pages compatible — static files only
- Never hardcode API keys
- All config from localStorage (set in Settings)
- Fully responsive — works on mobile
- Inline error messages only — no alert()

## Project Credentials (use these exactly)
SUPABASE_URL=https://fteopoguabbydprwoyxv.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZW9wb2d1YWJieWRwcndveXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyODczODUsImV4cCI6MjA5MTg2MzM4NX0.19hzkmEcLBXqBYB43hse9ZzaaAHvoYXzz-JyHpAys2o
GITHUB_TOKEN=<!-- set this in Settings page — never commit real tokens -->
GITHUB_REPO=novagames911/FluxiAds