const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
export async function askGemini(instruction, input) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Number(process.env.GEMINI_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: `${instruction}\nINPUT:${JSON.stringify(input)}` }] }], generationConfig: { responseMimeType: "application/json", temperature: .1 } }) });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const text = (await response.json())?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")); } catch { throw new Error("Gemini returned invalid JSON"); }
  } finally { clearTimeout(timeout); }
}
export { MODEL };
