const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const DEFAULT_RETRIES = Number(process.env.GEMINI_RETRIES || 2);
function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

export async function askGemini(instruction, input, { retries = DEFAULT_RETRIES } = {}) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  // Ensure a fetch implementation is available. Prefer global fetch (Node >=18).
  let fetchFn = (typeof fetch === "function") ? fetch : null;
  if (!fetchFn) {
    try {
      // Attempt to dynamically import node-fetch when global fetch isn't present
      const mod = await import("node-fetch");
      fetchFn = mod?.default || mod;
      if (typeof fetchFn === "function") fetchFn = fetchFn.bind(globalThis);
    } catch (err) {
      throw new Error("global fetch is not available in this runtime and node-fetch could not be imported; ensure Node >=18 or install node-fetch");
    }
  }

  const payload = {
    contents: [{ parts: [{ text: `${instruction}\nINPUT:${JSON.stringify(input)}` }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  };

  let attempt = 0;
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.GEMINI_TIMEOUT_MS || 15000));
    try {
      const response = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

      if (!response.ok) {
        // Retry on 5xx (transient) errors
        if (response.status >= 500 && attempt <= retries) {
          await sleep(500 * (2 ** (attempt - 1)));
          continue;
        }
        const bodyText = await response.text().catch(() => "");
        throw new Error(`Gemini request failed (${response.status})${bodyText ? ': ' + bodyText.slice(0, 200) : ''}`);
      }

      const body = await response.json().catch(() => null);
      const candidates = body?.candidates || [];
      let text = "";

      // Robust extraction: try common shapes and fallbacks
      for (const c of candidates) {
        if (c?.content?.parts?.length) {
          text = c.content.parts.map((p) => p.text || "").join("");
          if (text) break;
        }
        if (c?.content?.text) { text = c.content.text; break; }
      }
      text = text || (typeof body?.outputText === "string" ? body.outputText : "");

      if (!text) {
        // treat empty response as transient and retry
        if (attempt <= retries) {
          await sleep(500 * (2 ** (attempt - 1)));
          continue;
        }
        throw new Error("Gemini returned empty response");
      }

      try {
        return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
      } catch (err) {
        throw new Error("Gemini returned invalid JSON");
      }
    } catch (err) {
      const isAbort = err && err.name === "AbortError";
      const isTransient = isAbort || (err && /ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(err.message || ""));
      if (isTransient && attempt <= retries) {
        await sleep(500 * (2 ** (attempt - 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { MODEL };
