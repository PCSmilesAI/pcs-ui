# Developer Setup — PCS AI Platform

This guide gets you from zero to a running local development environment.

---

## Prerequisites

- Node.js 18 or higher (`node --version`)
- npm 8 or higher (`npm --version`)
- Git
- A GitHub account with access to the PCSmilesAI organization
- The `.env` file (get this from Braxton — it contains API keys and database config)

---

## 1. Clone the Repository

```bash
git clone https://github.com/PCSmilesAI/pcs-ui.git
cd pcs-ui
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Environment Setup

Copy the environment template and fill in values:

```bash
cp .env.example .env
```

Ask Braxton for the values for:
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- `PCS_LLM_PROVIDER` and `PCS_LLM_MODEL`
- `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET`
- `SESSION_SECRET`
- Any other keys in `.env.example`

> The production `.env` is never committed to Git. Never commit your `.env` file.

---

## 4. Run the Development Server

The app has two processes: the Next.js frontend and the Express API server.

**Terminal 1 — Next.js frontend:**
```bash
npm run dev
```

**Terminal 2 — Express API server (QBO, health, metrics):**
```bash
npm run dev:api
```

- Frontend: http://localhost:3000
- API server: http://localhost:3001

---

## 5. Branch Workflow

### Branch Rules

| Branch | Purpose | Who touches it |
|--------|---------|---------------|
| `main` | Production — what pcsmilesai.com runs | Only via merged PRs |
| `staging` | Integration testing before production | Merges from feature branches |
| `feature/credit-card-receipts` | McKay's receipts module | McKay only |
| `feature/*` | Any isolated feature work | Whoever owns the feature |

### Starting New Work

Always branch from `main`:

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### Committing

```bash
git add -A
git commit -m "short description of what changed"
git push origin feature/your-feature-name
```

### Getting Your Work into Production

1. Push your feature branch to GitHub
2. Open a Pull Request: `feature/your-branch → staging`
3. Test on staging
4. If good: open a PR `staging → main`
5. After merge to main, deploy:

```bash
ssh root@137.184.183.253 "cd /var/www/pcs-ui && git pull origin main && npm run build && pm2 restart pcs-ui"
```

### Syncing with Main (avoiding conflicts)

If `main` has moved ahead while you were working:

```bash
git checkout main
git pull origin main
git checkout feature/your-branch
git merge main
# resolve any conflicts, then:
git push origin feature/your-branch
```

---

## 6. Database

The database lives at `pcs_ui_data/pcs.db` and is **not tracked by Git** (it is in `.gitignore`).

- Production database: `/var/www/pcs-ui/pcs_ui_data/pcs.db` on the server
- Local development: a fresh local database is created automatically on first run
- Migrations run automatically when the app starts

**Never run `git checkout -- .` or `git reset --hard` on the production server** — it can corrupt or overwrite the database. See `DEPLOYMENT.md` for safe deployment procedures.

---

## 7. Building for Production

```bash
npm run build
```

This runs `scripts/prebuild-metadata.sh` then `next build`. Fix any TypeScript or ESLint errors before deploying.

---

## 8. Repository Structure Quick Reference

```
pcs-ui/
├── app/                  Next.js App Router (pages + API routes)
│   ├── api/              API route handlers (route.ts files)
│   └── [PageName]/       Page route shells (thin wrappers)
├── src/
│   ├── ui-pages/         Actual page component implementations (.jsx)
│   └── components/       Shared UI components (NavBar, AppLayout, etc.)
├── lib/                  Server-side business logic
│   ├── db/               Database client + migrations
│   ├── invoices/         AP invoice business logic
│   ├── receipts/         Credit card receipts business logic (McKay)
│   ├── qbo/              QuickBooks Online integration
│   └── gpt/              AI/LLM helpers
├── context/              AI agent context files (markdown)
│   ├── company/          Company-level facts (load always)
│   ├── verticals/        Domain-level context (load per vertical)
│   ├── modules/          Module-specific rules (load per module)
│   └── vendors/          Vendor-specific parsing rules
├── docs/                 Developer documentation
├── pcs_ai_data/          JSON queue files, chart of accounts (gitignored)
├── pcs_ui_data/          SQLite database (gitignored)
└── *.py                  Vendor-specific Python invoice parsers
```

---

## 9. Getting Help

- Braxton Ellsworth — platform architecture, invoice module, deployment
- McKay — credit card receipts module, overall vision
- Crozier — analytics, BI, data infrastructure
