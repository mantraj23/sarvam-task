import test from "node:test";
import assert from "node:assert/strict";
import { validateSurvey, validateAnswer, inferAnswer, answerLabel, spokenQuestion, validateTranslation } from "../public/model.js";
import { resolveLanguage, resolveSurveyLanguage, languages } from "../public/survey.js";

const csat = { id: "q1", type: "csat", prompt: "How satisfied are you?" };
const open = { id: "q2", type: "open", prompt: "What can we improve?" };
const choice = { id: "q3", type: "choice", prompt: "How did you hear about us?", options: ["A friend", "Social media", "Walked past"] };
const survey = (questions) => ({ title: "Customer feedback", questions });

test("surveys require two or three complete, distinct questions", () => {
  assert.equal(validateSurvey(survey([csat, open])), "");
  assert.equal(validateSurvey(survey([csat, open, choice])), "");
  assert.ok(validateSurvey(survey([csat])));
  assert.ok(validateSurvey(survey([csat, open, choice, { ...open, id: "q4" }])));
  assert.ok(validateSurvey(survey([csat, { ...open, prompt: " " }])));
  assert.ok(validateSurvey(survey([csat, csat])));
  assert.ok(validateSurvey({ title: " ", questions: [csat, open] }));
});

test("multiple choice rejects incomplete and duplicate options", () => {
  for (const options of [["Only one"], ["Yes", ""], ["Yes", " yes "], ["A".repeat(61), "B"]]) {
    assert.ok(validateSurvey(survey([open, { ...choice, options }])));
  }
});

test("CSAT and choice keep structured values, including the first option", () => {
  for (const value of [1, 2, 3, 4, 5]) assert.equal(validateAnswer(csat, value), true);
  for (const value of [0, 6, 1.5, "5", null]) assert.equal(validateAnswer(csat, value), false);
  assert.equal(validateAnswer(choice, 0), true);
  assert.equal(validateAnswer(choice, 3), false);
  assert.equal(answerLabel(choice, 0), "A friend");
  assert.equal(answerLabel(csat, 4), "4 / 5");
  assert.equal(validateAnswer(open, "  "), false);
});

test("spoken answers use clear matches and leave ambiguous responses unselected", () => {
  assert.equal(inferAnswer(csat, "five."), 5);
  assert.equal(inferAnswer(csat, "चार।"), 4);
  for (const digit of ["५", "৫", "૫", "೫", "൫", "୫", "੫", "௫", "౫"]) assert.equal(inferAnswer(csat, digit), 5);
  assert.equal(inferAnswer(choice, "social media."), 1);
  assert.equal(inferAnswer(choice, "1"), 0);
  assert.equal(inferAnswer(csat, "Not five, maybe two"), null);
  assert.equal(inferAnswer(choice, "I am not sure"), null);
});

test("translation preserves question identity, types and option positions", () => {
  const original = [csat, choice];
  const translated = [{ prompt: "आप कितने संतुष्ट हैं?", type: "open", id: "changed" }, { prompt: "आपने हमारे बारे में कैसे सुना?", options: ["दोस्त", "सोशल मीडिया", "रास्ते में"] }];
  const result = validateTranslation(original, translated);
  assert.equal(result[0].id, csat.id);
  assert.equal(result[0].type, "csat");
  assert.deepEqual(result[1].options, translated[1].options);
  assert.equal(original[0].prompt, csat.prompt);
  assert.throws(() => validateTranslation(original, translated.slice(1)));
  assert.throws(() => validateTranslation(original, [translated[0], { prompt: "Question", options: ["one", "one", "two"] }]));
});

test("all supported spoken questions fit the endpoint limit and customer preference wins", () => {
  const longestChoice = { ...choice, prompt: "Q".repeat(500), options: Array.from({ length: 6 }, () => "x".repeat(60)) };
  for (const language of Object.keys(languages)) {
    assert.ok(spokenQuestion({ ...csat, prompt: "Q".repeat(500) }, language).length <= 1000);
    assert.ok(spokenQuestion(longestChoice, language).length <= 1000);
  }
  assert.equal(resolveLanguage("ta-IN", "Maharashtra"), "ta-IN");
  assert.equal(resolveLanguage("auto", "Maharashtra"), "mr-IN");
  assert.equal(resolveLanguage("auto", "Other region"), "en-IN");
});

test("the test uses the chosen survey language until a customer region or preference overrides it", () => {
  assert.equal(resolveSurveyLanguage("auto", "All India / unspecified", "hi-IN"), "hi-IN");
  assert.equal(resolveSurveyLanguage("auto", "Other region", "ta-IN"), "ta-IN");
  assert.equal(resolveSurveyLanguage("auto", "Maharashtra", "hi-IN"), "mr-IN");
  assert.equal(resolveSurveyLanguage("te-IN", "Maharashtra", "hi-IN"), "te-IN");
  assert.equal(resolveSurveyLanguage("auto", "All India / unspecified", "invalid"), "en-IN");
});

test("English question text cannot pass as a translated Hindi question", () => {
  assert.throws(() => validateTranslation([csat, open], [csat, open], "hi-IN"), /not translated/);
  const result = validateTranslation([csat, open], [{ prompt: "आप कितने संतुष्ट हैं?" }, { prompt: "हम क्या सुधार सकते हैं?" }], "hi-IN");
  assert.equal(result[0].id, csat.id);
  assert.match(spokenQuestion(result[0], "hi-IN"), /आप कितने संतुष्ट/);
  assert.ok(!spokenQuestion(result[0], "hi-IN").includes(csat.prompt));
  for (const [code, data] of Object.entries(languages)) {
    assert.doesNotThrow(() => validateTranslation([open], [{ prompt: data.questions[0] }], code));
  }
});
