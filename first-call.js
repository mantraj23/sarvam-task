import { writeFile } from "node:fs/promises";
import { SarvamAIClient } from "sarvamai";

// API reference: https://docs.sarvam.ai/api-reference/text-to-speech/convert
async function main() {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) {
    console.error("Add SARVAM_API_KEY to .env, then run npm start.");
    process.exitCode = 1;
    return;
  }

  const client = new SarvamAIClient({
    apiSubscriptionKey: apiKey,
    maxRetries: 0,
    timeoutInSeconds: 60,
  });
  const response = await client.textToSpeech.convert({
    text: "Hello! Thank you for joining our survey. On a scale of one to five, how satisfied are you with our service?",
    language_code: "en-IN",
    model: "bulbul:v4-flash",
    speaker: "simran_en_customer",
    output_audio_codec: "wav",
  });

  if (!response.audios?.[0]) throw new Error("No audio returned.");
  await writeFile(
    new URL("survey-question.wav", import.meta.url),
    Buffer.from(response.audios[0], "base64"),
  );
  console.log("Saved survey-question.wav");
}

main().catch((error) => {
  // Avoid logging request details, which could contain credentials.
  console.error(`First call failed${error.statusCode ? ` (HTTP ${error.statusCode})` : ""}. Check your key, credits, and connection.`);
  process.exitCode = 1;
});
