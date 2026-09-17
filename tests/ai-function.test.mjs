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

test("AI endpoint calls Gemini without returning the secret", async () => {
  setEnvironment({ GEMINI_API_KEY: "private-test-key" });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(options.headers["x-goog-api-key"], "private-test-key");
    const sent = JSON.parse(options.body);
    assert.equal(sent.input[0].text, "Evaluate this find");
    assert.equal(sent.system_instruction.includes("Flip Finder AI"), true);
    return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text: '{"suggestedName":"Test item"}' }] }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const response = await aiHandler(request({ mode: "analysis", prompt: "Evaluate this find", photos: [] }), { requestId: "test-2" });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.output, '{"suggestedName":"Test item"}');
  assert.equal(payload.model, "gemini-3.6-flash");
  assert.doesNotMatch(JSON.stringify(payload), /private-test-key/);
});

test("AI endpoint rejects unsupported image data before calling the model", async () => {
  setEnvironment({ GEMINI_API_KEY: "private-test-key" });
  globalThis.fetch = async () => {
    throw new Error("upstream should not be called");
  };
  const response = await aiHandler(request({ mode: "analysis", prompt: "Evaluate", photos: ["https://example.com/not-allowed.jpg"] }), { requestId: "test-3" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /unsupported/i);
});

test("AI endpoint replaces Google's raw invalid-key error with setup guidance", async () => {
  setEnvironment({ GEMINI_API_KEY: "invalid-test-key" });
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" }
  }), { status: 400, headers: { "content-type": "application/json" } });
  const response = await aiHandler(request({ mode: "analysis", prompt: "Read barcode", photos: [] }), { requestId: "test-invalid-key" });
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.match(payload.error, /GEMINI_API_KEY/);
  assert.doesNotMatch(payload.error, /invalid-test-key/);
});

test("market research uses Google Search grounding and returns only cited sources", async () => {
  setEnvironment({ GEMINI_API_KEY: "private-test-key" });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(options.headers["x-goog-api-key"], "private-test-key");
    const sent = JSON.parse(options.body);
    assert.deepEqual(sent.tools, [{ type: "google_search" }]);
    return new Response(JSON.stringify({
      steps: [{
        type: "model_output",
        content: [{ type: "text", text: "{\"summary\":\"Grounded\"}", annotations: [{ type: "url_citation", url: "https://example.com/comp", title: "Comparable" }] }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const response = await aiHandler(request({ mode: "market", prompt: "Find evidence", photos: [] }), { requestId: "test-market" });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.output, '{"summary":"Grounded"}');
  assert.deepEqual(payload.citations, [{ title: "Comparable", url: "https://example.com/comp" }]);
  assert.doesNotMatch(JSON.stringify(payload), /private-test-key/);
});
