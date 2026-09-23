# Deploying VoiceGuard AI (Vercel + Supabase)

**TL;DR:** Vercel hosts the **frontend only**. The FastAPI backend — the only
component that talks to Supabase — must run somewhere that supports a
long-running Python process: Render, Railway, or Fly.io. Supabase needs no
"connection" on Vercel itself; the backend just reads `SUPABASE_URL` +
`SUPABASE_KEY` from its own environment.

```
Browser ──HTTPS──▶ Vercel (React SPA)
     │                  │  fetch /api/*
     ▼                  ▼
     └──────▶ FastAPI backend (Render/Railway) ──▶ Supabase (Postgres)
```

## 1. Supabase (one-time)

1. Create the project at supabase.com.
2. Open **SQL Editor** and run the contents of `backend/schema.sql`
   (tables: `incidents`, `events`, `speakers`, `logs`, `reports`).
3. Grab from **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_KEY` (**secret** — backend only, never
     put it in Vercel env vars or the frontend bundle).

## 2a. Backend on HuggingFace Spaces — Docker (free, recommended for demos)

Free 16 GB CPU fits the models; Render free (512 MB) will OOM-crash on boot.

1. huggingface.co → New **Space** → SDK **Docker** → name it → Create.
2. The Space repo root must hold the backend files + `backend/Dockerfile`:
   push the *contents* of `voiceguard-ai/backend/` (main.py, models.py, …,
   requirements.txt, Dockerfile) to the Space repo root.
3. Space → **Settings → Variables and Secrets**: `SUPABASE_URL`,
   `SUPABASE_KEY` (secret), `GROQ_API_KEY` (secret), `FRONTEND_URL`
   (fill after step 3, then **Factory reboot** the Space).
4. Wait for the build, then open `/api/health`. First boot downloads ~1.5 GB
   of models — be patient once, then it stays warm while used.

## 2b. Backend on Render (or Railway / Fly.io)

The backend is a plain FastAPI app (or `render.yaml` Blueprint at repo root):
`pip install -r requirements.txt`,
`uvicorn main:app --host 0.0.0.0 --port $PORT`. Pick a **2 GB+ plan**.

> `backend/requirements.txt` is CPU-cloud safe. Torch+speechbrain make the
> first deploy slow (model downloads on startup; warmups run in background).

On Render: **New → Web Service → connect the repo →**
- **Root directory:** `backend`
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

Environment variables:

| Var | Value |
|---|---|
| `SUPABASE_URL` | from step 1 |
| `SUPABASE_KEY` | service_role key (marked secret) |
| `FRONTEND_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `GROQ_API_KEY` | optional — generated reports |

## 3. Frontend on Vercel

1. Push the repo to GitHub, then **vercel.com → Add New → Project → import**.
2. Vercel auto-detects Vite: build `npm run build`, output `dist`
   (`vercel.json` in the repo root already pins this + SPA rewrites).
3. Under **Settings → Environment Variables**, add:

| Var | Value |
|---|---|
| `VITE_BACKEND_URL` | backend origin from step 2, e.g. `https://sentinel-api.onrender.com` |
| `VITE_SOCKET_URL` | *(leave empty — current backend has no sockets)* |
| `VITE_TWILIO_NUMBER` | optional display value |

4. **Redeploy.** Vite bakes `VITE_*` vars into the JS bundle at build time —
   changing them in the dashboard does nothing until the next build.

## 4. Verify

- Open the deployed site → pages should show live data instead of demo mode.
- Backend health: `GET https://<backend-host>/api/health` (or `/health`).
- If pages fall back to demo mode, it's almost always **CORS**: confirm
  `FRONTEND_URL` on the backend matches the exact Vercel origin
  (`https://…vercel.app`, no trailing slash) and redeploy the backend.
- Supabase rows should appear under **Table Editor** after the first
  analysis/run.

## Local dev stays the same

- `backend/.env` → `SUPABASE_URL`, `SUPABASE_KEY`, `FRONTEND_URL=http://localhost:5173`
- `.env` → `VITE_BACKEND_URL=http://localhost:5000`
- `npm run dev` + `uvicorn main:app --port 5000 --reload`
