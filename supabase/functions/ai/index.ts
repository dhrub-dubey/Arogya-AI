// Arogya AI backend: one Supabase Edge Function that runs every AI task on FREE tiers.
//
// No single free tier is generous enough on its own, so each task has a pool of
// free models across Groq and Google Gemini. If a model is rate-limited, busy or
// slow, we skip it for a little while and use the next one. Users always get an answer.
//
//   symptoms / chat          -> Groq gpt-oss-120b, Gemini 3.8 Flash, Flash-Lite, gpt-oss-20b
//   disease / medicine       -> Groq gpt-oss with live web search, then Gemini, Qwen
//   report (PDF / photo)     -> Gemini (the free models that can read files)
//   hospital_phones          -> Groq gpt-oss with web search (only numbers found on real pages)
//   transcribe               -> Sarvam -> Groq Whisper -> Gemini
//
// Prompts live here, not in the browser, so API keys stay secret and nobody can
// use this function as a free general-purpose chatbot.
//
// Secrets (`supabase secrets set NAME=value`):
//   GEMINI_API_KEY   free key from https://aistudio.google.com/apikey
//   GROQ_API_KEY     free key from https://console.groq.com
//   SARVAM_API_KEY   optional, best speech-to-text for Indian languages
//   SARVAM_STT_MODEL optional, e.g. "saaras:v3"

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const SARVAM_API_KEY = Deno.env.get("SARVAM_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Errors with a message that is safe to show the user.
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
// Errors from an AI provider: logged on the server, never shown raw to users.
class ProviderError extends HttpError {
  constructor(status: number, message: string, public retryAfterMs = 0) {
    super(status, message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------- model pools

type Target = {
  provider: "groq" | "gemini";
  model: string;
  search?: boolean;    // Groq built-in web search (gpt-oss models only)
  reasoning?: "low" | "medium" | "high"; // gpt-oss reasoning effort
};

const G120 = "openai/gpt-oss-120b";
const G20 = "openai/gpt-oss-20b";
const QWEN = "qwen/qwen3.8-27b";
const FLASH = "gemini-3.8-flash";
const LITE = "gemini-3.5-flash-lite";

// Gemini is noticeably better at Hindi and Bengali, so it goes first for those.
function poolFor(task: string, lang = "en"): Target[] {
  const indic = lang === "hi" || lang === "bn";
  switch (task) {
    case "symptoms": {
      const groq: Target = { provider: "groq", model: G120, reasoning: "medium" };
      const flash: Target = { provider: "gemini", model: FLASH };
      return [
        ...(indic ? [flash, groq] : [groq, flash]),
        { provider: "gemini", model: LITE },
        { provider: "groq", model: G20, reasoning: "medium" },
      ];
    }
    case "chat": {
      const groq: Target = { provider: "groq", model: G120, reasoning: "low" };
      const flash: Target = { provider: "gemini", model: FLASH };
      return [
        ...(indic ? [flash, groq] : [groq, flash]),
        { provider: "gemini", model: LITE },
        { provider: "groq", model: G20, reasoning: "low" },
        { provider: "groq", model: QWEN },
      ];
    }
    // Web searches use a lot of tokens, so they run on gpt-oss-20b and leave
    // gpt-oss-120b's per-minute budget for chat and symptoms.
    case "disease":
    case "medicine":
      return [
        { provider: "groq", model: G20, search: true, reasoning: "low" },
        { provider: "groq", model: G120, search: true, reasoning: "low" },
        { provider: "gemini", model: FLASH },
        { provider: "gemini", model: LITE },
        { provider: "groq", model: QWEN },
      ];
    case "report":
      return [{ provider: "gemini", model: FLASH }, { provider: "gemini", model: LITE }];
    case "hospital_phones":
      // Web search is mandatory here: a phone number must come from a real page.
      // Never falls back to gpt-oss-120b: a 20k-token search would starve chat.
      return [{ provider: "groq", model: G20, search: true, reasoning: "low" }];
    default:
      return [{ provider: "gemini", model: LITE }];
  }
}

// Short-term memory (per warm server instance) of which models are failing.
const cooldownUntil = new Map<string, number>();
const keyOf = (t: Target) => `${t.provider}:${t.model}`;
const DEFAULT_COOLDOWN_MS = 90_000;

function benched(t: Target, e: unknown) {
  const ms = e instanceof ProviderError && e.retryAfterMs > 0
    ? Math.min(Math.max(e.retryAfterMs, 10_000), 5 * 60_000)
    : DEFAULT_COOLDOWN_MS;
  cooldownUntil.set(keyOf(t), Date.now() + ms);
}

// Ready models first; models that recently failed go last instead of being dropped,
// so a request still has something to try when everything is cooling down.
function ordered(pool: Target[]) {
  const now = Date.now();
  const configured = pool.filter((t) => (t.provider === "groq" ? GROQ_API_KEY : GEMINI_API_KEY));
  const ready = configured.filter((t) => (cooldownUntil.get(keyOf(t)) ?? 0) <= now);
  const cooling = configured.filter((t) => (cooldownUntil.get(keyOf(t)) ?? 0) > now);
  return [...ready, ...cooling];
}

const isOverload = (e: unknown) =>
  e instanceof ProviderError && [408, 413, 429, 498, 500, 502, 503, 504].includes(e.status);

// ---------------------------------------------------------------- provider calls

type Msg = { role: "user" | "assistant"; content: string };
// deno-lint-ignore no-explicit-any
type GeminiPart = any;

async function timedFetch(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return { res: await fetch(url, { ...init, signal: controller.signal }), timer };
  } catch (e) {
    clearTimeout(timer);
    throw new ProviderError(504, `${url} did not respond in time (${(e as Error).name})`);
  }
}

function retryAfter(res: Response) {
  const s = Number(res.headers.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? s * 1000 : 0;
}

// Groq (OpenAI-compatible). Returns the reply text plus any web pages it searched.
async function groq(
  t: Target,
  system: string,
  messages: Msg[],
  opts: { json?: boolean; stream?: boolean; timeoutMs?: number },
) {
  const body: Record<string, unknown> = {
    model: t.model,
    messages: [{ role: "system", content: system }, ...messages],
    stream: !!opts.stream,
  };
  if (t.model.startsWith("openai/gpt-oss")) body.reasoning_effort = t.reasoning ?? "medium";
  if (t.search) body.tools = [{ type: "browser_search" }];
  else if (opts.json) body.response_format = { type: "json_object" };

  const { res, timer } = await timedFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, opts.timeoutMs ?? 40_000);

  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text();
    throw new ProviderError(res.status, `Groq ${t.model} ${res.status}: ${text.slice(0, 300)}`, retryAfter(res));
  }
  if (opts.stream) {
    clearTimeout(timer);
    return { res, text: "", sources: [] as Source[] };
  }
  const data = await res.json();
  clearTimeout(timer);
  const msg = data?.choices?.[0]?.message ?? {};
  return { res, text: String(msg.content ?? ""), sources: groqSources(msg) };
}

// Gemini. Returns the reply text.
async function gemini(
  t: Target,
  system: string,
  contents: { role: string; parts: GeminiPart[] }[],
  opts: { schema?: unknown; stream?: boolean; timeoutMs?: number },
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${t.model}:` +
    (opts.stream ? "streamGenerateContent?alt=sse" : "generateContent");
  const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: system }] }, contents };
  if (opts.schema) body.generationConfig = { responseMimeType: "application/json", responseJsonSchema: opts.schema };

  const { res, timer } = await timedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify(body),
  }, opts.timeoutMs ?? 35_000);

  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text();
    throw new ProviderError(res.status, `Gemini ${t.model} ${res.status}: ${text.slice(0, 300)}`, retryAfter(res));
  }
  if (opts.stream) {
    clearTimeout(timer);
    return { res, text: "" };
  }
  const data = await res.json();
  clearTimeout(timer);
  const text = geminiText(data);
  if (!text) {
    const why = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "unknown";
    throw new ProviderError(502, `Gemini ${t.model} returned no text (${why})`);
  }
  return { res, text };
}

// deno-lint-ignore no-explicit-any
const geminiText = (data: any): string =>
  (data?.candidates?.[0]?.content?.parts ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((p: any) => p.text && !p.thought)
    // deno-lint-ignore no-explicit-any
    .map((p: any) => p.text)
    .join("");

type Source = { title: string; url: string };

// deno-lint-ignore no-explicit-any
function groqSources(msg: any): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const tool of msg?.executed_tools ?? []) {
    for (const r of tool?.search_results?.results ?? []) {
      if (!r?.url || seen.has(r.url) || !/^https?:\/\//.test(r.url)) continue;
      seen.add(r.url);
      out.push({ title: String(r.title || new URL(r.url).hostname).slice(0, 120), url: r.url });
    }
  }
  return out.slice(0, 6);
}

// Strip the citation markers gpt-oss adds after searching, e.g. "【1†L14-L18】".
const stripCitations = (s: string) => s.replace(/【[^】]*】/g, "").replace(/[ \t]+\n/g, "\n");

// deno-lint-ignore no-explicit-any
function cleanStrings(v: any): any {
  if (typeof v === "string") return stripCitations(v).trim();
  if (Array.isArray(v)) return v.map(cleanStrings);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanStrings(x)]));
  return v;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch { /* try harder below */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch { /* fall through */ }
  }
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s >= 0 && e > s) return JSON.parse(text.slice(s, e + 1));
  throw new ProviderError(502, "The model did not return valid JSON");
}

// ---------------------------------------------------------------- structured tasks

const DEADLINE_MS = 75_000; // stay well inside the Edge Function time limit

type StructuredJob = {
  task: string;
  lang?: string;
  system: string;
  userText: string;
  files?: GeminiPart[]; // inline files (Gemini only)
  // deno-lint-ignore no-explicit-any
  schema: any;
};

// Run a JSON task on the first model in its pool that answers properly.
async function structured(job: StructuredJob) {
  const started = Date.now();
  const schemaRule = `\n\nReturn ONLY one JSON object (no markdown fences, no commentary) matching this JSON Schema:\n${JSON.stringify(job.schema)}`;
  const failures: string[] = [];

  for (const t of ordered(poolFor(job.task, job.lang))) {
    const left = DEADLINE_MS - (Date.now() - started);
    if (left < 8_000) break;
    if (job.files?.length && t.provider !== "gemini") continue;
    try {
      let text: string, sources: Source[] = [];
      if (t.provider === "groq") {
        const searchRule = t.search
          ? "\n\nUse web search to check the facts against reliable sources (official, government, manufacturer or major medical sites) before answering."
          : "";
        ({ text, sources } = await groq(t, job.system + searchRule + schemaRule, [{ role: "user", content: job.userText }], {
          json: true,
          timeoutMs: Math.min(left - 2_000, t.search ? 45_000 : 35_000),
        }));
      } else {
        ({ text } = await gemini(t, job.system, [{ role: "user", parts: [...(job.files ?? []), { text: job.userText }] }], {
          schema: job.schema,
          timeoutMs: Math.min(left - 2_000, 35_000),
        }));
      }
      const result = cleanStrings(parseJson(text));
      if (keyOf(t) !== keyOf(poolFor(job.task, job.lang)[0])) console.warn(`${job.task}: answered by ${keyOf(t)}`);
      return { result, sources, model: t.model, searched: !!t.search };
    } catch (e) {
      failures.push(`${keyOf(t)}: ${(e as Error).message.slice(0, 160)}`);
      if (isOverload(e)) benched(t, e);
    }
  }
  console.error(`${job.task}: every model failed`, failures);
  throw new HttpError(503, "The AI is very busy right now. Please try again in a minute.");
}

// ---------------------------------------------------------------- prompts

const LANGS: Record<string, string> = {
  en: "English",
  hi: "Hindi (हिन्दी, Devanagari script)",
  bn: "Bengali (বাংলা, Bengali script)",
};

const langRule = (lang?: string) =>
  `Write every user-facing string in ${LANGS[lang ?? "en"] ?? "English"}. ` +
  `Keep medicine names, lab test names, values and units in their standard form.`;

const BASE = `You are Arogya AI, a careful, evidence-based health assistant built for people in India.
- Be accurate first. Follow current clinical guidelines (WHO, ICMR, MoHFW, NICE, CDC). Never invent facts, numbers, brands or sources.
- Think about the Indian context: common local conditions (dengue, malaria, typhoid, TB, anaemia, diabetes, hypertension), Indian brand names, and the 112 / 108 emergency numbers.
- Explain things in plain language a patient understands, without losing medical precision.
- Never claim a definitive diagnosis. Point clearly to red-flag signs that need urgent care.
- You support, and do not replace, a qualified doctor.`;

const str = { type: "string" };
const strList = { type: "array", items: str };

const SCHEMAS = {
  symptoms: {
    type: "object",
    properties: {
      risk_level: { type: "string", enum: ["low", "moderate", "high"] },
      analysis_text: str,
      possible_conditions: strList,
      recommendations: strList,
      when_to_seek_help: str,
    },
    required: ["risk_level", "analysis_text", "possible_conditions", "recommendations", "when_to_seek_help"],
  },
  disease: {
    type: "object",
    properties: {
      name: str, overview: str, symptoms: str, causes: str, risk_factors: str,
      prevention: str, treatment: str, when_to_seek_help: str,
    },
    required: ["name", "overview", "symptoms", "causes", "risk_factors", "prevention", "treatment", "when_to_seek_help"],
  },
  medicine: {
    type: "object",
    properties: {
      medicine_name: str,
      composition: str,
      recommended_dosage: str,
      used_for: strList,
      similar_medicines: {
        type: "array",
        items: { type: "object", properties: { name: str, composition: str }, required: ["name", "composition"] },
      },
      side_effects: str,
      precautions: str,
    },
    required: ["medicine_name", "composition", "recommended_dosage", "used_for", "similar_medicines", "side_effects", "precautions"],
  },
  report: {
    type: "object",
    properties: { summary: str, key_findings: strList, risk_factors: strList, suggested_actions: strList },
    required: ["summary", "key_findings", "risk_factors", "suggested_actions"],
  },
  phones: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: { index: { type: "integer" }, phone: { type: ["string", "null"] }, source: { type: ["string", "null"] } },
          required: ["index", "phone", "source"],
        },
      },
    },
    required: ["results"],
  },
};

// ---------------------------------------------------------------- tasks

// deno-lint-ignore no-explicit-any
type Input = Record<string, any>;

const requireText = (v: unknown, name: string, max = 4000) => {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `Missing "${name}"`);
  return v.trim().slice(0, max);
};

async function symptoms(i: Input) {
  const { result } = await structured({
    task: "symptoms",
    lang: i.lang,
    system: `${BASE}
You are doing careful symptom triage, the way an experienced Indian general physician would.
- Weigh how long the symptoms have lasted and how severe they are. Consider common and dangerous causes, ordered by likelihood.
- risk_level is "high" if ANY red flag is present (e.g. chest pain, breathing difficulty, confusion, fainting, severe bleeding, stroke signs, high fever with rash or bleeding gums, severe dehydration, suicidal thoughts). Use "moderate" when a doctor visit is needed within a day or two.
- analysis_text is a short, well-structured markdown explanation of the likely picture.
- possible_conditions lists 3 to 6 items, most likely first, each with a one-line reason.
- recommendations are concrete, safe next steps, including home care and which tests or specialist may help.
- when_to_seek_help names the specific warning signs, and says to call 112 or 108 in an emergency.
${langRule(i.lang)}`,
    userText: `Symptoms: ${requireText(i.symptoms, "symptoms")}\nDuration: ${i.duration || "not given"}\nSeverity: ${i.severity || "not given"}`,
    schema: SCHEMAS.symptoms,
  });
  return result;
}

async function disease(i: Input) {
  const { result, sources } = await structured({
    task: "disease",
    lang: i.lang,
    system: `${BASE}
Give a complete, accurate patient-education guide about the condition the user asks about.
Each field is markdown (short paragraphs or bullet lists). Include Indian context where relevant (prevalence, seasonal patterns, government programmes, vaccines).
If the query is misspelled, use the closest real condition. ${langRule(i.lang)}`,
    userText: `Condition: ${requireText(i.query, "query", 200)}`,
    schema: SCHEMAS.disease,
  });
  return { ...result, sources };
}

async function medicine(i: Input) {
  const { result, sources } = await structured({
    task: "medicine",
    lang: i.lang,
    system: `${BASE}
You are a clinical pharmacist in India. Identify the exact medicine the user names (Indian brand or generic) and confirm its composition and strength.
- composition: the active ingredient(s) with exact strengths.
- recommended_dosage: standard adult dosing from the label or guidelines. Add child or elderly notes where relevant, and remind the user to follow their doctor's prescription.
- similar_medicines: real Indian brands with the SAME composition and strength (generic / Jan Aushadhi options are welcome).
- side_effects and precautions: markdown, including major interactions, pregnancy and contraindications.
If the name is ambiguous or misspelled, choose the most likely Indian product and say so in medicine_name. ${langRule(i.lang)}`,
    userText: `Medicine: ${requireText(i.query, "query", 200)}`,
    schema: SCHEMAS.medicine,
  });
  return { ...result, sources };
}

async function report(i: Input, authHeader: string) {
  const path = requireText(i.path, "path", 500);
  // Download as the signed-in user, so storage access rules still apply.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: file, error } = await userClient.storage.from("health-reports").download(path);
  if (error || !file) throw new HttpError(404, "Could not read the uploaded report");
  if (file.size > 20 * 1024 * 1024) throw new HttpError(413, "Report is larger than 20 MB");

  const ext = path.split(".").pop()?.toLowerCase();
  const mimeType = file.type && file.type !== "application/octet-stream"
    ? file.type
    : ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const { result } = await structured({
    task: "report",
    lang: i.lang,
    system: `${BASE}
You are reading a patient's medical document (lab report, prescription, discharge summary or scan report).
- Read EVERY value carefully. For lab tests, compare each value with the reference range printed on the report (or a standard adult range if none is printed) and mark it as high, low or normal.
- summary: a clear markdown overview of what the report shows and what matters most.
- key_findings: each important result as "Test: value unit (ref range) - meaning". Put abnormal results first.
- risk_factors: health risks suggested by the abnormal results.
- suggested_actions: practical next steps (which doctor to see, follow-up tests, lifestyle steps), with urgency.
If the image is unreadable or not a medical document, say so in summary and leave the lists empty. Never make up values. ${langRule(i.lang)}`,
    userText: "Analyse this medical report.",
    files: [{ inlineData: { mimeType, data: encodeBase64(new Uint8Array(await file.arrayBuffer())) } }],
    schema: SCHEMAS.report,
  });
  return result;
}

// Find phone numbers for hospitals that the free map data has none for.
// Only numbers the model actually saw on a web page (with that page's URL) are kept.
// Results are cached for everyone, so each place is searched once.
const NOT_FOUND_RETRY_MS = 7 * 24 * 60 * 60_000; // re-search "not found" places after a week
const cacheKey = (name: string, address: string) =>
  `${name}|${address}`.toLowerCase().replace(/[^\p{L}\p{N}|]+/gu, " ").trim().slice(0, 300);
const admin = () =>
  SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

async function hospitalPhones(i: Input) {
  // deno-lint-ignore no-explicit-any
  const list: { name: string; address: string }[] = (Array.isArray(i.hospitals) ? i.hospitals : [])
    .slice(0, 8)
    // deno-lint-ignore no-explicit-any
    .map((h: any) => ({ name: String(h?.name ?? "").slice(0, 120), address: String(h?.address ?? "").slice(0, 160) }))
    .filter((h) => h.name);
  if (!list.length) return { results: [] };
  const area = typeof i.area === "string" ? i.area.slice(0, 120) : "";
  const keys = list.map((h) => cacheKey(h.name, h.address));
  const results: { index: number; phone: string; source: string }[] = [];

  // 1) Serve what we already know.
  const db = admin();
  const known = new Map<string, { phone: string | null; source: string | null; updated_at: string }>();
  if (db) {
    const { data } = await db.from("hospital_phone_cache").select("key, phone, source, updated_at").in("key", keys);
    for (const row of data ?? []) known.set(row.key, row);
  }
  const toSearch: number[] = [];
  keys.forEach((k, idx) => {
    const hit = known.get(k);
    if (hit?.phone) results.push({ index: idx, phone: hit.phone, source: hit.source ?? "" });
    else if (!hit || Date.now() - Date.parse(hit.updated_at) > NOT_FOUND_RETRY_MS) toSearch.push(idx);
  });
  if (!toSearch.length) return { results, cached: true };

  // 2) Search the web for the rest (at most 6 per request).
  const batch = toSearch.slice(0, 6);
  const lines = batch
    .map((idx, n) => `${n}. ${list[idx].name}${list[idx].address ? `, ${list[idx].address}` : ""}`)
    .join("\n");
  let found: { index: number; phone: string; source: string }[] = [];
  try {
    const { result } = await structured({
      task: "hospital_phones",
      system: `You find official contact phone numbers for hospitals and clinics in India using web search.
- Search for each place by its exact name and locality. Prefer the hospital's own website, government health sites, Google Business listings, Justdial or Practo.
- Only give a number you actually saw on a page about THAT exact place, and put that page's URL in "source".
- If you cannot find a number for a place, set phone and source to null. Never guess and never reuse a number from a different place.
- Use the index number given for each place.`,
      userText: `Places${area ? ` near ${area}` : ""}:
${lines}`,
      schema: SCHEMAS.phones,
    });
    // deno-lint-ignore no-explicit-any
    found = (result?.results ?? []).flatMap((r: any) => {
      const n = Number(r?.index);
      const phone = typeof r?.phone === "string" ? r.phone.trim() : "";
      const source = typeof r?.source === "string" ? r.source.trim() : "";
      const digits = phone.replace(/\D/g, "");
      if (!Number.isInteger(n) || n < 0 || n >= batch.length) return [];
      if (digits.length < 6 || digits.length > 15 || !/^https?:\/\//.test(source)) return [];
      return [{ index: batch[n], phone, source }];
    });
  } catch (e) {
    // Out of free search quota right now: return what the cache had.
    if (results.length) return { results, cached: true };
    throw e;
  }

  // 3) Remember the answers, including "not found", for everyone.
  if (db) {
    const rows = batch.map((idx) => {
      const f = found.find((x) => x.index === idx);
      return {
        key: keys[idx],
        name: list[idx].name,
        phone: f?.phone ?? null,
        source: f?.source ?? null,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await db.from("hospital_phone_cache").upsert(rows);
    if (error) console.error("phone cache write failed", error.message);
  }
  return { results: [...results, ...found] };
}

// ---------------------------------------------------------------- chat (streamed)

async function chat(i: Input) {
  // deno-lint-ignore no-explicit-any
  const history: any[] = Array.isArray(i.messages) ? i.messages.slice(-20) : [];
  const messages: Msg[] = history
    .filter((m) => typeof m?.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 8000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    throw new HttpError(400, "The last message must come from the user");
  }

  const system = `${BASE}
You are chatting with a patient. Be warm, calm and thorough, like a trusted family doctor who has time to explain.
- Answer the actual question first, then add useful context. Use markdown (short paragraphs, bullet lists, **bold** for key points). Do not use tables.
- Ask a short follow-up question when important details are missing (age, duration, medicines, existing conditions).
- Only when the situation sounds urgent or dangerous, say clearly at the top to call 112 / 108 or go to the nearest emergency room. For everyday problems (a cold, mild fever, acidity) just mention which warning signs would need a doctor, near the end.
- End medical advice with one short line reminding them to consult a doctor. Do not add it to small talk.
${langRule(i.lang)}
- Language matching overrides the rule above: if the user writes in Hinglish (Hindi in Roman letters), reply in Hinglish; if they write in Hindi, Bengali or another language, reply in that language.`;

  // Find the first model that starts streaming, then pass its words straight through.
  const failures: string[] = [];
  for (const t of ordered(poolFor("chat", i.lang))) {
    try {
      if (t.provider === "groq") {
        const { res } = await groq(t, system, messages, { stream: true, timeoutMs: 20_000 });
        return streamText(res, (data) => data?.choices?.[0]?.delta?.content ?? "");
      }
      const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const { res } = await gemini(t, system, contents, { stream: true, timeoutMs: 20_000 });
      return streamText(res, geminiText);
    } catch (e) {
      failures.push(`${keyOf(t)}: ${(e as Error).message.slice(0, 160)}`);
      if (isOverload(e)) benched(t, e);
    }
  }
  console.error("chat: every model failed", failures);
  throw new HttpError(503, "The AI is very busy right now. Please try again in a minute.");
}

// Turn a provider's server-sent-events stream into a plain text stream for the browser.
// deno-lint-ignore no-explicit-any
function streamText(res: Response, pick: (data: any) => string) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let inCitation = false;
      try {
        for await (const chunk of res.body!.pipeThrough(new TextDecoderStream())) {
          buffer += chunk;
          let nl;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              let text = pick(JSON.parse(payload));
              // Drop citation markers like 【1†L4-L8】 even when split across chunks.
              let out = "";
              for (const ch of text) {
                if (ch === "【") inCitation = true;
                else if (ch === "】") inCitation = false;
                else if (!inCitation) out += ch;
              }
              text = out;
              if (text) controller.enqueue(encoder.encode(text));
            } catch { /* ignore keep-alive / partial lines */ }
          }
        }
      } catch (e) {
        console.error("chat stream error", e);
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

// ---------------------------------------------------------------- speech to text

async function transcribe(i: Input) {
  const audio = requireText(i.audio, "audio", 15_000_000); // base64 16 kHz mono WAV
  const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
  const wav = () => new Blob([bytes], { type: "audio/wav" });
  const errors: string[] = [];

  // 1) Sarvam: built for Indian languages and code-mixed speech (Hinglish etc.).
  if (SARVAM_API_KEY) {
    try {
      const form = new FormData();
      form.append("file", wav(), "audio.wav");
      form.append("language_code", "unknown"); // auto-detect, so mixed languages work
      const model = Deno.env.get("SARVAM_STT_MODEL");
      if (model) form.append("model", model);
      const r = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: { "api-subscription-key": SARVAM_API_KEY },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`Sarvam ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const d = await r.json();
      return { text: (d.transcript ?? "").trim(), provider: "sarvam" };
    } catch (e) {
      errors.push(String(e));
    }
  }

  // 2) Groq Whisper: free and fast, good for English.
  if (GROQ_API_KEY) {
    try {
      const form = new FormData();
      form.append("file", wav(), "audio.wav");
      form.append("model", "whisper-large-v3-turbo");
      form.append("response_format", "json");
      form.append("prompt", "A patient describing health symptoms, medicines and lab tests. May mix Hindi, Bengali and English.");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const d = await r.json();
      return { text: (d.text ?? "").trim(), provider: "groq" };
    } catch (e) {
      errors.push(String(e));
    }
  }

  // 3) Gemini can transcribe audio too.
  for (const model of [LITE, FLASH]) {
    try {
      const { text } = await gemini({ provider: "gemini", model }, "You transcribe audio exactly.", [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "audio/wav", data: audio } },
          {
            text: "Transcribe this audio exactly as spoken, in the script of the spoken language (Devanagari for Hindi, Bengali script for Bengali). " +
              "Spell medicine and medical terms correctly. Output only the transcript, nothing else.",
          },
        ],
      }], { timeoutMs: 25_000 });
      return { text: text.trim(), provider: "gemini" };
    } catch (e) {
      errors.push(String(e));
    }
  }
  console.error("All speech-to-text providers failed:", errors);
  throw new HttpError(502, "Speech recognition failed. Please try again.");
}

// ---------------------------------------------------------------- server

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Only signed-in users may use the AI.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Please log in");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new HttpError(401, "Your session has expired. Please log in again.");

    const input = await req.json().catch(() => ({})) as Input;
    switch (input.task) {
      case "chat": return await chat(input);
      case "symptoms": return json(await symptoms(input));
      case "disease": return json(await disease(input));
      case "medicine": return json(await medicine(input));
      case "report": return json(await report(input, authHeader));
      case "hospital_phones": return json(await hospitalPhones(input));
      case "transcribe": return json(await transcribe(input));
      default: throw new HttpError(400, `Unknown task "${input.task}"`);
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ProviderError) {
      return json({ error: "The AI service had a problem. Please try again." }, 502);
    }
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
