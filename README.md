# SurveySaarthi survey admin

An admin workspace for small businesses to create, test, and review short voice surveys. Plain JavaScript, Node.js, and the Sarvam SDK; no frontend framework or extra dependencies.

## Run locally

1. Add your real key after `SARVAM_API_KEY=` in `.env`. Keep this file ignored.
2. Run `npm install` if dependencies are missing.
3. Run `npm run dev` and open http://localhost:3000. The server watches for code changes. If an older server is running, stop it with Ctrl+C before restarting.
4. The original single-call script remains available with `npm start`.

No Sarvam request is made on page load or when creating a survey. Requests only happen when the admin starts a voice test, plays a question, or transcribes an answer.

## Admin workflow

1. **Survey builder:** Name the survey, select the default language the agent should speak, and add two or three questions. You can type questions in English or another language. Each question can be open-ended, multiple choice (2–6 options), or CSAT (1–5). **Preview translation** shows questions and choices in the selected language. Create the survey to save its original questions and default spoken language.
2. **Test your agent:** Select a saved survey and enter a test customer profile. The default survey language is used when no region or preferred language is specified. A region supplies a regional language, and an explicit customer preference overrides both. Sarvam detects the actual input language and translates all questions and choices before the voice test, even when an existing survey's language label matches the target. Questions that fail the expected script check block the test instead of falling back to untranslated English. Review the translated preview before using a survey with real customers.
3. **Answer questions:** Listen, record up to 25 seconds, and review the transcript. Confirm the selected option or CSAT score before saving. Ambiguous voice answers require an explicit selection. Typed answers and direct option/rating selections are also supported.
4. **Responses:** Review each saved test, its questions, open-ended answers, selected options, scores, and playable recordings. Download individual audio files and export response metadata as JSON. The export names the audio files; download recordings separately.
5. Answers are saved after each **Save & continue**. Completed and partial test sessions are listed separately by status. An unsaved answer or recording is lost on reload or when ending the test.

The interface contains only admin tools and an embedded test experience. There is no public customer link, telephone calling, business account login, or shared dashboard in this version. Every session is labeled as a test.

## Storage

Surveys, response snapshots, transcripts, and original audio Blobs are stored in IndexedDB in the browser on the current device. Saved data survives refreshes. It is not synced to a server or shared with another browser, device, or business account. Clearing browser/site data removes it; downloads provide a portable copy.

Recordings are sent to Sarvam for transcription. API keys are only read by server routes and never stored in the browser database.

For a production service used by multiple businesses, the next step is authenticated business accounts and a shared database/object store. Keep the current deployment protected for a private pilot.

## Languages and APIs

Supports English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, and Telugu. Regional suggestions are editable and do not assume that everyone in a region speaks the same language.

- Bulbul v3: spoken questions, options, and CSAT scale instructions.
- Saaras v4: customer speech transcription.
- Sarvam-105B: detects the language of the actual input text and translates custom questions/options into the selected customer language. Validates the expected script and translated question/option counts; preserves original question IDs, types, and option positions. Translation previews are reused in memory for identical questions and language; editing a question or changing the target requires a fresh translation.

This version follows the admin's questionnaire. It does not generate adaptive follow-up questions.

## Deploy to Vercel

1. Push the project to your Git repository without `.env`, then import it in Vercel.
2. Choose **Other** as the framework preset. Leave the build command empty. The output directory is `public`; `vercel.json` configures it and the Node.js functions under `api/`.
3. Add `SARVAM_API_KEY` in Vercel's project environment variables for the intended environment. Deploy or redeploy after changing it. Never use a public frontend environment variable for the key.
4. Open the HTTPS deployment. Microphone recording needs HTTPS or localhost.
5. Keep Deployment Protection enabled for the private admin pilot. This version includes no authentication or persistent API usage limits.

Browser-stored data on localhost does not transfer to the Vercel deployment because each origin has its own storage.

## Verification

Run `npm test` for survey validation, structured response values, multilingual number handling, translation integrity, speech request limits, and language precedence. Regression tests inject local completion fixtures to confirm that matching language labels cannot bypass translation and that untranslated English is rejected for Hindi speech. They use no key or network. Browser checks cover creation, default-language inheritance, reload persistence, response rendering, stored audio playback with an isolated local fixture, and mobile layout without calling Sarvam.

A live test of synthesis, transcription, and translation requires a valid key and microphone permission. These have not been verified with your key. Codex has not deployed this project.

References: [Sarvam TTS](https://docs.sarvam.ai/api-reference/text-to-speech/convert), [Sarvam STT](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe), [Sarvam Chat](https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).
