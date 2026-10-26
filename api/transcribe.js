import { client, fail, json, validate } from "../lib/sarvam.js";

const formats = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav" };

export default async function handler(req, res) {
  try {
    const body = validate(req, res);
    if (!body) return;
    const type = typeof body.mime === "string" ? body.mime.split(";")[0] : "";
    if (!formats[type] || typeof body.audio !== "string" || !body.audio.length || body.audio.length > 3_500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) {
      return json(res, 400, { error: "Record a short audio answer (up to 25 seconds)." });
    }
    const file = new File([Buffer.from(body.audio, "base64")], `answer.${formats[type]}`, { type });
    const result = await client().speechToText.transcribe({
      file, model: "saaras:v4", language_code: body.language,
    });
    json(res, 200, { transcript: result.transcript || "" });
  } catch (error) { fail(res, error); }
}
