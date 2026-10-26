import { SarvamAIClient } from "sarvamai";

const languages = new Set(["en-IN", "hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"]);

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function validate(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    json(res, 405, { error: "Use POST for this endpoint." });
    return null;
  }
  let body;
  try {
    const value = req.body;
    body = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    json(res, 400, { error: "Send a valid JSON request." });
    return null;
  }
  if (!body || !languages.has(body.language)) {
    json(res, 400, { error: "Choose a supported survey language." });
    return null;
  }
  return body;
}

export function client() {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw Object.assign(new Error(), { missingKey: true });
  return new SarvamAIClient({ apiSubscriptionKey: key, maxRetries: 0, timeoutInSeconds: 50 });
}

export function fail(res, error) {
  // Never send SDK errors, request headers, or credentials to the browser/logs.
  const status = error.missingKey ? 503 : error.statusCode === 429 ? 429 : 502;
  const message = error.missingKey
    ? "Voice is not configured yet. Add SARVAM_API_KEY on the server and restart or redeploy."
    : error.statusCode === 429
      ? "The voice service is busy. Please try again shortly."
      : "The voice service could not complete the request. Check the server API key, credits, and connection, then retry.";
  json(res, status, { error: message });
}
