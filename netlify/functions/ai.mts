const MODEL_ENDPOINT = "https://models.github.ai/inference/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4.1-mini";
const MAX_BODY_BYTES = 5_500_000;
const MAX_PROMPT_LENGTH = 30_000;
const MAX_PHOTOS = 4;
const MAX_PHOTO_LENGTH = 1_700_000;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    }
  });
}

function allowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return "";
  const ownOrigin = new URL(request.url).origin;
  const configured = (Netlify.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return origin === ownOrigin || configured.includes(origin) || local ? origin : null;
}

function corsHeaders(origin) {
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        vary: "Origin"
      }
    : {};
}

function validPhoto(value) {
  return typeof value === "string"
    && value.length <= MAX_PHOTO_LENGTH
    && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value);
}

export default async (request, context) => {
  const origin = allowedOrigin(request);
  if (origin === null) return json({ error: "This app address is not allowed." }, 403);
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "The photos are too large. Use four or fewer images." }, 413, cors);

  const token = Netlify.env.get("GITHUB_MODELS_TOKEN");
  if (!token) return json({ error: "The free AI connection has not been configured yet." }, 503, cors);

  let input;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "The photos are too large. Use four or fewer images." }, 413, cors);
    input = JSON.parse(raw);
  } catch {
    return json({ error: "The AI request was not valid." }, 400, cors);
  }

  const mode = input.mode === "analysis" ? "analysis" : input.mode === "chat" ? "chat" : null;
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const photos = Array.isArray(input.photos) ? input.photos.slice(0, MAX_PHOTOS) : [];

  if (!mode || !prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return json({ error: "The AI request is missing information or is too long." }, 400, cors);
  }
  if (photos.some((photo) => !validPhoto(photo))) {
    return json({ error: "One of the photos is unsupported or too large." }, 400, cors);
  }

  const content = [
    { type: "text", text: prompt },
    ...photos.map((photo) => ({ type: "image_url", image_url: { url: photo, detail: "low" } }))
  ];
  const model = Netlify.env.get("GITHUB_MODEL") || DEFAULT_MODEL;

  try {
    const upstream = await fetch(MODEL_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2026-03-10"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are Flip Finder AI, a conservative Canadian resale-flipping assistant. Clearly separate visible facts from possibilities, never invent comparable sales, preserve collectible features, disclose defects, and avoid unsafe repair advice."
          },
          { role: "user", content }
        ],
        temperature: mode === "analysis" ? 0.15 : 0.35,
        max_tokens: mode === "analysis" ? 2400 : 1800,
        ...(mode === "analysis" ? { response_format: { type: "json_object" } } : {})
      })
    });

    const remaining = upstream.headers.get("x-ratelimit-remaining-requests");
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = upstream.status === 429
        ? "Today’s free GitHub Models allowance has been reached. Try again after it resets."
        : result?.error?.message || "GitHub Models could not complete this request.";
      return json({ error: message }, upstream.status === 429 ? 429 : 502, cors);
    }

    const output = result?.choices?.[0]?.message?.content;
    if (typeof output !== "string" || !output.trim()) {
      return json({ error: "The AI returned an empty response." }, 502, cors);
    }

    console.log(JSON.stringify({ requestId: context.requestId, mode, model, photos: photos.length, status: "ok" }));
    return json({ output: output.trim(), model, remaining: remaining ? Number(remaining) : null }, 200, cors);
  } catch (error) {
    console.error(JSON.stringify({ requestId: context.requestId, mode, status: "failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "The free AI service could not be reached. Try again shortly." }, 502, cors);
  }
};

export const config = {
  path: "/api/ai",
  method: ["POST", "OPTIONS"]
};
