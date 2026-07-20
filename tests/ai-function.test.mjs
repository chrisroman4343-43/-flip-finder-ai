import test from "node:test";
import assert from "node:assert/strict";
import aiHandler from "../netlify/functions/ai.mts";

const originalFetch = globalThis.fetch;

function setEnvironment(values = {}) {
  globalThis.Netlify = {
    env: {
      get(name) {
        return values[name];
      }
    }
  };
}

function request(body) {
  return new Request("https://flip-finder.example/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://flip-finder.example" },
    body: JSON.stringify(body)
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.Netlify;
});

test("AI endpoint refuses to run until the server-side token is configured", async () => {
  setEnvironment();
  const response = await aiHandler(request({ mode: "chat", prompt: "Help me evaluate this item", photos: [] }), { requestId: "test-1" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not been configured/i);
});

test("AI endpoint calls GitHub Models without returning the secret", async () => {
  setEnvironment({ GITHUB_MODELS_TOKEN: "private-test-token", GITHUB_MODEL: "openai/gpt-4.1-mini" });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://models.github.ai/inference/chat/completions");
    assert.equal(options.headers.authorization, "Bearer private-test-token");
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, "openai/gpt-4.1-mini");
    assert.equal(sent.messages[1].content[0].text, "Evaluate this find");
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"suggestedName":"Test item"}' } }] }), {
      status: 200,
      headers: { "content-type": "application/json", "x-ratelimit-remaining-requests": "149" }
    });
  };

  const response = await aiHandler(request({ mode: "analysis", prompt: "Evaluate this find", photos: [] }), { requestId: "test-2" });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.output, '{"suggestedName":"Test item"}');
  assert.equal(payload.remaining, 149);
  assert.doesNotMatch(JSON.stringify(payload), /private-test-token/);
});

test("AI endpoint rejects unsupported image data before calling the model", async () => {
  setEnvironment({ GITHUB_MODELS_TOKEN: "private-test-token" });
  globalThis.fetch = async () => {
    throw new Error("upstream should not be called");
  };
  const response = await aiHandler(request({ mode: "analysis", prompt: "Evaluate", photos: ["https://example.com/not-allowed.jpg"] }), { requestId: "test-3" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /unsupported/i);
});

