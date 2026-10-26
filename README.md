# ✨ Imagify

> **Free, professional image editing — entirely in your browser.**
> No installs. No server uploads. No cost. Ever.

---

## 🖼️ What is Imagify?

Imagify is a powerful, client-side image processing web app that runs entirely in your browser. Every tool — from compression to AI background removal — processes your images locally on your device. Your files never touch a server. No privacy concerns, no subscriptions, no limits.

Built for designers, developers, and content creators who need professional image tools without the bloat of desktop software or the cost of SaaS tools.

---

## ⚡ Features

| Tool | Technology | Description |
|------|-----------|-------------|
| 🗜️ **Image Compressor** | Canvas API | Reduce file size with a quality slider and live before/after preview |
| 📐 **Image Resizer** | Canvas API | Custom dimensions or presets — HD, 4K, Instagram, Twitter |
| 🔄 **Format Converter** | Canvas API | Convert between PNG, JPG, and WebP instantly |
| ✂️ **Image Cropper** | Canvas API | Drag handles, aspect ratio lock, free-form crop |
| 💧 **Watermark Adder** | Canvas API | Text overlays with position controls and opacity slider |
| ☀️ **Brightness & Contrast** | CSS Filters | Real-time filter sliders with live preview |
| 🔡 **Image to Base64** | FileReader API | Convert any image to Base64 string with one-click copy |
| 🤖 **Background Remover** | WebAssembly + AI | AI-powered removal, runs fully in browser, ~50MB one-time model download |

---

## 🔐 Authentication

- Email and password signup with email verification
- Google OAuth — one-click sign in
- Forgot password via Supabase magic link email
- Rate limiting — 5 failed attempts triggers a 15-minute lockout
- All auth handled securely via Supabase Auth

---

## 👻 Guest Mode

No account? No problem. Use any tool **3 times for free** — no signup required. Processed images can be downloaded instantly. After 3 uses, a soft nudge invites you to create a free account to unlock cloud saves.

---

## ☁️ Cloud Storage

| Detail | Value |
|--------|-------|
| Provider | Supabase Storage |
| Per-user limit | 50MB |
| Stored files | Processed images only (originals stay on your device) |
| Access control | Row Level Security — users see only their own files |
| Bucket | `processed-images` (private) |

---

## 🛡️ Privacy & Security

- ✅ Images are processed **100% in your browser** — never uploaded to any server
- ✅ Supabase Row Level Security (RLS) enforces strict data isolation
- ✅ Auth attempts are rate-limited and logged
- ✅ Anon key is safe to expose — RLS handles all access control
- ✅ Storage bucket is private — no public URLs

---

## 🏗️ Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | Vanilla HTML + CSS + JS | Zero dependencies, deploys anywhere |
| Image Processing | Canvas API + FileReader | Built into every browser, no libraries needed |
| Background Removal | @imgly/background-removal | Free, open-source, WebAssembly, runs in browser |
| Auth | Supabase Auth | Google OAuth, magic links, built-in, free tier |
| Database | Supabase PostgreSQL | Managed, RLS support, free tier |
| File Storage | Supabase Storage | Per-user buckets, RLS policies, free tier |
| Hosting | Vercel / Netlify / GitHub Pages | Static files, zero config, free |

---

## 🗂️ Project Structure

```
📁 imagify/
├── 📄 index.html       ← Landing page + Auth (login, signup, reset password)
├── 📄 dashboard.html   ← Full dashboard + all 8 tool workspaces
├── 🎨 app.css          ← Complete design system + all component styles
└── ⚡ app.js           ← All JavaScript — auth, tools, Supabase, logic
```

Four files. No build tools. No npm. No terminal. Just open in a browser.

---

## 🗄️ Database Schema

### `files` table
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key → `auth.users.id` |
| `original_name` | TEXT | Original filename |
| `processed_url` | TEXT | Supabase Storage URL |
| `tool_used` | TEXT | compressor, resizer, cropper, etc. |
| `original_size` | BIGINT | File size before processing (bytes) |
| `processed_size` | BIGINT | File size after processing (bytes) |
| `created_at` | TIMESTAMPTZ | Timestamp of processing |

### `auth_attempts` table
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `identifier` | TEXT | Email address used |
| `ip_address` | TEXT | Optional IP tracking |
| `attempt_at` | TIMESTAMPTZ | Timestamp of attempt |
| `success` | BOOLEAN | Whether attempt succeeded |

---

## ⚙️ Database Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `check_rate_limit(email)` | BOOLEAN | `true` = allowed, `false` = locked out |
| `log_auth_attempt(email, success, ip)` | VOID | Logs every auth attempt |
| `get_lockout_minutes(email)` | INTEGER | Minutes remaining in lockout |
| `clean_old_attempts()` | VOID | Deletes attempts older than 24 hours |
| `get_user_storage_bytes(user_id)` | BIGINT | Total bytes used by user |

---

## 🎨 Design System

Inspired by **Claude.ai** — warm dark tones, focused workspaces, minimal chrome.

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#1a1610` | Page background |
| `--bg-sidebar` | `#201c16` | Sidebar background |
| `--bg-card` | `#2a2520` | Cards and panels |
| `--bg-input` | `#252018` | Input fields |
| `--accent` | `#cc785c` | Buttons, active states, highlights |
| `--accent-hover` | `#b8674d` | Button hover state |
| `--text-primary` | `#ece5d8` | Main body text |
| `--text-secondary` | `#a09880` | Subtext and labels |
| `--text-muted` | `#6b6255` | Disabled states and hints |
| `--border` | `#3a342c` | Dividers and input borders |
| `--success` | `#6db887` | Success messages |
| `--error` | `#e05c5c` | Error messages |

### Typography
- Font: **Inter** (Google Fonts)
- Base size: 14px / weight 400
- Headings: 600–700 weight, 20–32px
- Spacing unit: 4px base (4, 8, 12, 16, 24, 32, 48, 64)

---

## 📱 Responsive Behaviour

| Breakpoint | Sidebar | Auth Forms | Tools Grid |
|------------|---------|------------|------------|
| Desktop ≥ 1024px | Full (240px with labels) | Centered modal | 4 columns |
| Tablet 768–1023px | Icon-only (60px) | Centered modal | 3 columns |
| Mobile < 768px | Hidden (hamburger menu) | Bottom sheet | 2 columns |

---

## 🚀 Build Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | 🏠 Landing Page + Auth + Dashboard Shell | 🔄 In Progress |
| 2 | 🗜️ Image Compressor | ⏳ Pending |
| 3 | 📐 Image Resizer | ⏳ Pending |
| 4 | 🔄 Format Converter | ⏳ Pending |
| 5 | ✂️ Image Cropper | ⏳ Pending |
| 6 | ☀️ Brightness & Contrast Editor | ⏳ Pending |
| 7 | 💧 Watermark Adder | ⏳ Pending |
| 8 | 🔡 Image to Base64 | ⏳ Pending |
| 9 | 🤖 Background Remover | ⏳ Pending |
| 10 | 📁 File History + Supabase Storage | ⏳ Pending |

---

## 🔧 Setup

### 1. Clone or download the project
```bash
git clone https://github.com/yourusername/imagify.git
cd imagify
```

### 2. Configure Supabase
Open `app.js` and the credentials are already set:
```javascript
const SUPABASE_URL = 'https://fdljvwhwtoyrlxcrkorq.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

### 3. Run the SQL schema
Copy the full SQL from `Imagify_Plan.txt` and run it in your
Supabase project's SQL Editor. This creates all tables, functions,
RLS policies, and the storage bucket in one shot.

### 4. Open in browser
```bash
# No build step needed — just open the file
open index.html
```

Or deploy to Vercel / Netlify by dragging the folder into their dashboard.

---

## 🌐 Deployment

Imagify is four static files. Deploy anywhere:

- **Vercel** — drag and drop or connect GitHub repo
- **Netlify** — same as above
- **GitHub Pages** — push to repo, enable Pages in settings
- **Any static host** — upload the four files, done

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">
  <strong>✨ Imagify — Transform your images in seconds.</strong><br/>
  Free forever. No installs. No server. Just your browser.
</div>
