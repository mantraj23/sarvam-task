# Svara voice survey studio

A minimal JavaScript survey app for Vercel. No frontend framework or additional dependencies. Uses Sarvam Bulbul v3 for multilingual speech and Saaras v4 for transcription.

## Run locally

1. Paste your real key after `SARVAM_API_KEY=` in `.env`. Never commit it.
2. Run `npm install` if dependencies are not already installed.
3. Run `npm run dev` and open http://localhost:3000.

The original first-call script is still available with `npm start`. No API request is sent on page load. Voice calls happen when a user starts a survey, plays a question, or submits a recording.

## Use the survey

- Choose the customer's region and preferred language. An explicit profile preference wins; the region suggests a default. English is the fallback for other regions. This is a manual profile form; no CRM or geolocation is connected.
- Supports English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, and Telugu for spoken questions and answers.
- Each language includes three translated customer-feedback questions. Edit the questions before starting; write custom questions in the selected language. Custom questions are not automatically translated. Changing language restores the starter questions.
- Start the survey, listen, then tap **Record answer**. Tap stop to transcribe; recordings stop after 25 seconds. Review/edit the answer, then save and continue. Typing also works.
- Download the completed session as JSON. Answers are held in tab memory, not in a database. Reloading or resetting loses them. Audio is sent to Sarvam for processing; the app does not store recordings.
- This version follows a fixed questionnaire. It does not yet generate adaptive follow-up questions, make telephone calls, or save a shared response dashboard.

## Deploy to Vercel

1. Push this project to your own Git repository, keeping `.env` ignored, then import the repository into Vercel.
2. Choose **Other** as the framework preset. Leave the build command empty; output directory is `public` (also configured in `vercel.json`). The `api/` directory contains Node.js serverless functions.
3. Add `SARVAM_API_KEY` in Vercel's project environment variables for the intended environments, then deploy/redeploy. The key is only used by server functions; never prefix it with a public frontend variable name.
4. Open the HTTPS deployment, choose a language, and start a real survey. Allow microphone access when recording.

This app includes no sign-in or persistent rate limiter. For a private pilot, keep Vercel Deployment Protection enabled. Before opening it broadly, add access control and persistent usage limits so visitors cannot consume your Sarvam credits without limits.

## Verification

Local syntax checks and tests can run without Sarvam requests. A real end-to-end voice check requires a valid key, microphone permission, and a browser on HTTPS or localhost. This app has not been deployed by Codex.

References: [Sarvam TTS](https://docs.sarvam.ai/api-reference/text-to-speech/convert), [Sarvam STT](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe), [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js).
