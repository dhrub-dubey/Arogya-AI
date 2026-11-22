import { supabase } from '@/lib/supabase';

// All AI work runs in the "ai" Supabase Edge Function (supabase/functions/ai),
// which keeps API keys on the server and routes each task to the right provider.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai`;

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please log in again.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The AI runs on free tiers, which can be busy for a few seconds at a time.
// On "busy" (503/429) we wait a moment and try once more before giving up.
async function postWithRetry(body, signal) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify(body),
      signal,
    });
    if ((res.status === 503 || res.status === 429) && attempt === 0) {
      await wait(3000);
      continue;
    }
    return res;
  }
}

async function errorFrom(res) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || `AI request failed (${res.status})`);
}

/** Run a structured AI task: 'symptoms' | 'disease' | 'medicine' | 'report' | 'hospitals' | 'transcribe'. */
export async function runAI(task, input, { signal } = {}) {
  const res = await postWithRetry({ task, ...input }, signal);
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

/** Stream a chat reply. Calls onToken(fullTextSoFar) as text arrives; resolves with the full reply. */
export async function streamChat({ messages, lang, onToken, signal }) {
  const res = await postWithRetry({ task: 'chat', messages, lang }, signal);
  if (!res.ok) throw await errorFrom(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onToken?.(text);
  }
  text += decoder.decode();
  if (!text.trim()) throw new Error('The AI did not reply. Please try again.');
  return text;
}
