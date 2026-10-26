import { client, fail, json, validate } from "../lib/sarvam.js";

export default async function handler(req, res) {
  try {
    const body = validate(req, res);
    if (!body) return;
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 1000) {
      return json(res, 400, { error: "Enter a question of 1 to 1,000 characters." });
    }
    const result = await client().textToSpeech.convert({
      text: body.text.trim(), language_code: body.language,
      model: "bulbul:v3", speaker: "shubh", output_audio_codec: "wav",
    });
    if (!result.audios?.[0]) throw new Error();
    json(res, 200, { audio: result.audios[0] });
  } catch (error) { fail(res, error); }
}
