# Arogya AI

React + Vite health assistant. **Supabase** handles login, the database and file storage.
All AI runs in one Supabase Edge Function ([supabase/functions/ai/index.ts](supabase/functions/ai/index.ts)) on **free tiers only**, with no billing needed.

No single free tier is enough on its own, so every task has a pool of free models across **Groq** and **Google Gemini**.
If a model is rate-limited, busy or slow, the function skips it for a minute or two and uses the next one.

| Feature | Free models, in order |
|---|---|
| Symptom checker, AI chat | Groq `gpt-oss-120b` → Gemini 3.8 Flash → Gemini Flash-Lite → `gpt-oss-20b` (Gemini goes first for Hindi and Bengali) |
| Disease info, medicine info | Groq `gpt-oss` **with live web search** (sources shown) → Gemini → Qwen |
| Health report analysis (PDF / photo) | Gemini 3.8 Flash → Flash-Lite |
| Nearby hospitals | OpenStreetMap data (Overpass / Photon + Nominatim), fetched **in the browser** because these services block cloud servers |
| Hospital phone numbers | Groq `gpt-oss` with web search, keeping only numbers found on a real page. Cached for everyone in `hospital_phone_cache`, so each place is searched once |
| Voice input | Sarvam → Groq Whisper → Gemini |
| Read aloud | The browser's built-in speech |

API keys stay on the server and never reach the browser.

## Setup

1. `supabase login` and `supabase link --project-ref <your-project-ref>`
2. `supabase db push` creates the tables, security rules, private report storage and phone cache.
3. Add the free keys:
   ```
   supabase secrets set GEMINI_API_KEY=...   # https://aistudio.google.com/apikey (free, no billing)
   supabase secrets set GROQ_API_KEY=...     # https://console.groq.com (free)
   supabase secrets set SARVAM_API_KEY=...   # optional, best voice input for Indian languages
   ```
4. `supabase functions deploy ai --no-verify-jwt` (the function checks the login itself)
5. In the Supabase dashboard, under Authentication:
   - Set the Site URL and add `http://localhost:5173/**` to the redirect URLs.
   - Turn on Google sign-in.
   - Add `{{ .Token }}` to the "Confirm signup" email template, or turn off email confirmation.
6. `npm install` then `npm run dev`. `.env.local` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Deploy to Vercel (via GitHub)

1. Push this folder to a new GitHub repository. `.env.local` and other secrets are git-ignored, so they won't be uploaded.
2. On [vercel.com/new](https://vercel.com/new), import the repository. Vercel detects Vite automatically, and [vercel.json](vercel.json) makes links like `/chat` work when someone refreshes the page.
3. Before the first deploy, add these two **Environment Variables** (values are in Supabase → Project Settings → API, the same as `.env.local`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. You'll get an address like `https://arogya-ai.vercel.app`.
5. **Tell Supabase about the new address**, or login emails and Google sign-in will send people back to localhost. In Supabase → Authentication → URL Configuration:
   - **Site URL:** `https://your-app.vercel.app`
   - **Redirect URLs:** add `https://your-app.vercel.app/**` and keep `http://localhost:5173/**` for local work.

The AI function and database already live on Supabase, so nothing else changes. Every push to GitHub redeploys the site automatically.

**On phones**, people can install it like an app: in Chrome use ⋮ → *Add to Home screen*; in Safari use Share → *Add to Home Screen*.

## Free-tier limits

- **Speed:** answers take about 5–20 seconds. Chat starts streaming in about 1 second.
- **Heavy use:** free Groq web search allows only a few searches per minute. Under heavy use, disease and medicine answers can fall back to a model without search, so they show no sources.
- **Your data:** free-tier providers may use requests to improve their models. That's fine for a prototype; for real patient data, move to paid tiers. No code changes are needed: the model pools in `poolFor()` stay the same.
