const DEFAULT_ENDPOINT = "https://flip-finder-ai-api.netlify.app/api/ai";
const MAX_PHOTOS = 4;

function cleanPhotos(photos = []) {
  return photos
    .map((photo) => photo?.dataUrl || photo)
    .filter((value) => typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/i.test(value))
    .slice(0, MAX_PHOTOS);
}

export async function requestAi({ mode, prompt, photos = [] }) {
  if (!navigator.onLine) {
    throw new Error("You are offline. Reconnect to run the AI, while your saved projects remain available.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(DEFAULT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, prompt, photos: cleanPhotos(photos) }),
      signal: controller.signal
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // The friendly status-specific errors below are more useful than a JSON parsing error.
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("The free AI service is not connected to this app address yet.");
      }
      if (response.status === 429) {
        throw new Error("The free Gemini allowance has been reached for now. Your projects are safe; try again later.");
      }
      throw new Error(payload.error || "The AI could not answer right now. Try again in a moment.");
    }

    if (!payload.output || typeof payload.output !== "string") {
      throw new Error("The AI returned an empty answer. Try again with fewer photos.");
    }

    return {
      output: payload.output,
      model: payload.model || "Gemini 2.5 Flash",
      remaining: payload.remaining ?? null
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The AI took too long to answer. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
