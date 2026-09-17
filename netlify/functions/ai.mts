import type { Config, Context } from "@netlify/functions";

const MODEL = "gemini-2.5-flash";
const MAX_BODY_BYTES = 5_500_000;
const MAX_PROMPT_LENGTH = 30_000;
const MAX_PHOTOS = 4;
const MAX_PHOTO_LENGTH = 1_700_000;

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extraHeaders } });
}
function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return "";
  const ownOrigin = new URL(request.url).origin;
  const configured = (Netlify.env.get("ALLOWED_ORIGINS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return origin === ownOrigin || configured.includes(origin) || local ? origin : null;
}
function corsHeaders(origin: string | null) { return origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "Origin" } : {}; }
function upstreamError(result: any, fallback: string) {
  const message = String(result?.error?.message || "");
  const status = String(result?.error?.status || "");
  if (/api key not valid|api_key_invalid/i.test(`${message} ${status}`)) {
    return "The Gemini API key saved in Netlify is invalid. Replace GEMINI_API_KEY with a current key from Google AI Studio.";
  }
  return message || fallback;
}
function validPhoto(value: unknown): value is string { return typeof value === "string" && value.length <= MAX_PHOTO_LENGTH && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value); }
function photoPart(dataUrl: string) { const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/i); return match ? { inlineData: { mimeType: `image/${match[1].toLowerCase()}`, data: match[2] } } : null; }

function groundedOutput(result: any) {
  const sources = new Map<string, { title: string; url: string }>();
  const text = (result?.steps || [])
    .filter((step: any) => step?.type === "model_output")
    .flatMap((step: any) => step?.content || [])
    .filter((content: any) => content?.type === "text" && typeof content?.text === "string")
    .map((content: any) => {
      for (const annotation of content.annotations || []) {
        if (annotation?.type === "url_citation" && /^https:\/\//i.test(annotation.url || "")) {
          let fallbackTitle = "Grounded source";
          try { fallbackTitle = new URL(annotation.url).hostname; } catch { /* Keep the safe fallback title. */ }
          sources.set(annotation.url, { title: String(annotation.title || fallbackTitle), url: annotation.url });
        }
      }
      return content.text;
    }).join("\n").trim();
  return { output: text, citations: [...sources.values()].slice(0, 12) };
}

export default async (request: Request, context: Context) => {
  const origin = allowedOrigin(request);
  if (origin === null) return json({ error: "This app address is not allowed." }, 403);
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "The photos are too large. Use four or fewer images." }, 413, cors);

  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "The free Gemini AI connection has not been configured yet." }, 503, cors);

  let input: { mode?: unknown; prompt?: unknown; photos?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "The photos are too large. Use four or fewer images." }, 413, cors);
    input = JSON.parse(raw);
  } catch { return json({ error: "The AI request was not valid." }, 400, cors); }

  const mode = input.mode === "analysis" ? "analysis" : input.mode === "chat" ? "chat" : input.mode === "listing" ? "listing" : input.mode === "market" ? "market" : null;
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const photos = Array.isArray(input.photos) ? input.photos.slice(0, MAX_PHOTOS) : [];
  if (!mode || !prompt || prompt.length > MAX_PROMPT_LENGTH) return json({ error: "The AI request is missing information or is too long." }, 400, cors);
  if (photos.some((photo) => !validPhoto(photo))) return json({ error: "One of the photos is unsupported or too large." }, 400, cors);

  if (mode === "market") {
    try {
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ model: MODEL, input: prompt, tools: [{ type: "google_search" }] })
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const message = upstream.status === 429 ? "The free Gemini allowance has been reached for now. Try again later." : upstreamError(result, "Market research could not be completed.");
        return json({ error: message }, upstream.status === 429 ? 429 : 502, cors);
      }
      const grounded = groundedOutput(result);
      if (!grounded.output) return json({ error: "Market research returned no usable result." }, 502, cors);
      console.log(JSON.stringify({ requestId: context.requestId, mode, model: MODEL, citations: grounded.citations.length, status: "ok" }));
      return json({ ...grounded, model: MODEL, remaining: null }, 200, cors);
    } catch (error) {
      console.error(JSON.stringify({ requestId: context.requestId, mode, status: "failed", message: error instanceof Error ? error.message : "unknown" }));
      return json({ error: "Market research could not be reached. Try again shortly." }, 502, cors);
    }
  }

  const parts = [
    { text: prompt },
    ...photos.map((photo) => photoPart(photo)).filter(Boolean)
  ];
  const systemInstruction = "You are Flip Finder AI, a conservative Canadian resale-flipping assistant. Work with any item category. Clearly separate visible facts from possibilities, never invent comparable sales, use conservative local used-market estimates, preserve collectible features, disclose defects, and avoid unsafe repair advice. The app itself calculates the user's final buying verdict from fixed profit rules, so never override those rules. For normal local cash Facebook Marketplace/Kijiji sales, platform fees are zero unless the user supplies a real fee. Do not invent fuel costs or live sold listings.";

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: mode === "analysis" ? 0.15 : 0.35,
          maxOutputTokens: mode === "analysis" || mode === "listing" ? 2400 : 1800,
          ...(mode === "analysis" || mode === "listing" ? { responseMimeType: "application/json" } : {})
        }
      })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = upstream.status === 429 ? "The free Gemini allowance has been reached for now. Try again later." : upstreamError(result, "Gemini could not complete this request.");
      return json({ error: message }, upstream.status === 429 ? 429 : 502, cors);
    }
    const output = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!output) return json({ error: "The AI returned an empty response." }, 502, cors);
    console.log(JSON.stringify({ requestId: context.requestId, mode, model: MODEL, photos: photos.length, status: "ok" }));
    return json({ output, model: MODEL, remaining: null }, 200, cors);
  } catch (error) {
    console.error(JSON.stringify({ requestId: context.requestId, mode, status: "failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "The free AI service could not be reached. Try again shortly." }, 502, cors);
  }
};

export const config: Config = { path: "/api/ai", method: ["POST", "OPTIONS"] };
