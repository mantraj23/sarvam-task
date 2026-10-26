import test from "node:test";
import assert from "node:assert/strict";
import { createPrepareHandler } from "../api/prepare.js";
import { spokenQuestion } from "../public/model.js";

const questions = [
  { id: "q1", type: "csat", prompt: "How satisfied are you?" },
  { id: "q2", type: "choice", prompt: "What would you prefer?", options: ["Home delivery", "Store pickup"] },
];
const hindi = [
  { prompt: "आप कितने संतुष्ट हैं?" },
  { prompt: "आप क्या पसंद करेंगे?", options: ["घर पर डिलीवरी", "दुकान से लेना"] },
];
function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
}

test("matching language labels still translate English text before speech", async () => {
  const calls = [];
  // Inject a local completion fixture: no API key, network request, or Sarvam SDK call.
  const handler = createPrepareHandler(() => ({ chat: { completions: async (request) => {
    calls.push(request);
    return { choices: [{ message: { content: JSON.stringify({ questions: hindi }) } }] };
  } } }));
  const res = response();
  await handler({ method: "POST", body: { sourceLanguage: "hi-IN", language: "hi-IN", questions } }, res);
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /Detect the actual language/);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.language, "hi-IN");
  assert.equal(res.body.questions[0].id, "q1");
  assert.equal(res.body.questions[1].options[0], "घर पर डिलीवरी");
  const spoken = spokenQuestion(res.body.questions[0], "hi-IN");
  assert.match(spoken, /आप कितने संतुष्ट/);
  assert.ok(!spoken.includes("How satisfied"));
});

test("untranslated English is rejected instead of being sent to Hindi speech", async () => {
  const handler = createPrepareHandler(() => ({ chat: { completions: async () => ({
    choices: [{ message: { content: JSON.stringify({ questions }) } }],
  }) } }));
  const res = response();
  await handler({ method: "POST", body: { sourceLanguage: "auto", language: "hi-IN", questions } }, res);
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /translate every question into Hindi/);
  assert.equal(res.body.questions, undefined);
});
