import { languages, regions, resolveSurveyLanguage } from "./survey.js";
import { questionTypes, validateSurvey, validateAnswer, answerLabel, inferAnswer, spokenQuestion, validateTranslation } from "./model.js";
import { storage } from "./storage.js";

const $ = (id) => document.getElementById(id);
const make = (tag, className = "", text = "") => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const button = (text, className, action) => {
  const node = make("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
};
const newQuestion = (type = "open", prompt = "") => ({ id: crypto.randomUUID(), type, prompt, options: ["", ""] });
let draft = [newQuestion("csat", "How satisfied are you with your experience?"), newQuestion("open", "What could we do better next time?")];
let surveys = [], runs = [], selectedSurveyId = null, selectedRunId = null;
let run = null, busy = false, selectedValue = null, recording = null;
let recorder = null, stream = null, timer = null, voiceUrl = null, answerUrl = null;
let detailUrls = [], storageReady = false, dirtyDraft = false;
const translations = new Map();

function notice(message = "") { $("notice").textContent = message; $("notice").hidden = !message; }
function status(message) { $("status-pill").textContent = message; }
function currentSurvey() { return surveys.find((survey) => survey.id === selectedSurveyId); }
function currentQuestion() { return run?.questions[run.answers.length]; }
function currentValue() { return currentQuestion()?.type === "open" ? $("answer").value.trim() : selectedValue; }
function selectedLanguage() { return resolveSurveyLanguage($("language").value, $("region").value, currentSurvey()?.language); }
function liveRecording() { return recorder?.state === "recording"; }
function activeRun() { return run?.status === "in-progress"; }

function controls() {
  const locked = busy || liveRecording();
  $("create-survey").disabled = locked || activeRun() || !storageReady;
  $("preview-translation").disabled = locked;
  document.querySelectorAll("#builder-form input, #builder-form select, #builder-form textarea, #builder-form button[type=button]").forEach((node) => { node.disabled = locked; });
  $("start").disabled = locked || !currentSurvey() || !storageReady;
  $("record").disabled = busy;
  $("next").disabled = locked || !currentQuestion() || !validateAnswer(currentQuestion(), currentValue());
  $("replay").disabled = locked;
  $("answer").disabled = locked;
  $("stop-test").disabled = locked;
  $("test-again").disabled = locked;
  for (const id of ["customer", "region", "language", "test-survey"]) $(id).disabled = locked || activeRun();
  document.querySelectorAll("[data-view]").forEach((node) => { node.disabled = locked; });
  document.querySelectorAll("#structured-options button").forEach((node) => { node.disabled = locked; });
  document.querySelectorAll(".saved-survey button").forEach((node) => { node.disabled = locked || activeRun(); });
  $("agent-stage").classList.toggle("busy", busy);
}

function view(name) {
  if (busy || liveRecording()) return;
  const titles = {
    builder: ["Survey builder", "Better questions. Closer to your customers.", "Build a short survey, try your voice agent, and review every answer."],
    test: ["Test your agent", "Hear your survey come to life.", "Try the experience as a customer before sharing it with anyone."],
    responses: ["Responses", "Every answer, in one place.", "Review test transcripts, selected options, satisfaction scores, and voice recordings."],
  };
  for (const key of Object.keys(titles)) $(key + "-view").hidden = name !== key;
  document.querySelectorAll("[data-view]").forEach((node) => {
    node.classList.toggle("active", node.dataset.view === name);
    if (node.classList.contains("nav-link") && node.dataset.view === name) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  });
  $("breadcrumb").textContent = titles[name][0];
  $("page-title").textContent = titles[name][1];
  $("page-description").textContent = titles[name][2];
  if (name === "responses") renderResponses();
  controls();
}
document.querySelectorAll("[data-view]").forEach((node) => node.addEventListener("click", () => view(node.dataset.view)));

for (const [code, language] of Object.entries(languages)) {
  $("survey-language").add(new Option(language.name + " · " + language.native, code));
  $("language").add(new Option(language.name + " · " + language.native, code));
}
for (const region of Object.keys(regions)) $("region").add(new Option(region, region));

function updateLanguage() {
  const code = selectedLanguage();
  $("resolved-language").textContent = languages[code].name + " · " + languages[code].native;
  $("language-source").textContent = $("language").value !== "auto" ? "From customer profile" : ["All India / unspecified", "Other region"].includes($("region").value) ? "Default survey language" : "Suggested from region";
  $("session-language").textContent = languages[code].name + " · " + code;
}
$("region").addEventListener("change", updateLanguage);
$("language").addEventListener("change", updateLanguage);
$("survey-title").addEventListener("input", () => { dirtyDraft = true; });
$("survey-language").addEventListener("change", () => {
  dirtyDraft = true;
  $("translation-preview").hidden = true;
});
$("builder-form").addEventListener("input", () => { $("translation-preview").hidden = true; });

function renderEditor() {
  $("translation-preview").hidden = true;
  $("question-editor").replaceChildren();
  $("draft-count").textContent = draft.length + " / 3";
  $("add-question").hidden = draft.length >= 3;
  draft.forEach((question, index) => {
    const card = make("section", "panel question-card");
    const heading = make("div", "question-card-heading");
    heading.append(make("span", "step", String(index + 1).padStart(2, "0")), make("h3", "", "Question " + (index + 1)));
    const type = make("select", "type-select");
    type.setAttribute("aria-label", "Question " + (index + 1) + " type");
    for (const [value, label] of Object.entries(questionTypes)) type.add(new Option(label, value));
    type.value = question.type;
    type.addEventListener("change", () => { question.type = type.value; dirtyDraft = true; renderEditor(); });
    heading.append(type);
    if (draft.length > 2) heading.append(button("×", "remove-question", () => { draft.splice(index, 1); dirtyDraft = true; renderEditor(); }));
    card.append(heading);
    const label = make("label", "", "What would you like to ask?");
    label.htmlFor = "prompt-" + question.id;
    const prompt = make("textarea", "question-prompt");
    prompt.id = label.htmlFor;
    prompt.value = question.prompt;
    prompt.placeholder = "Write your question…";
    prompt.maxLength = 500;
    prompt.rows = 2;
    prompt.required = true;
    prompt.addEventListener("input", () => { question.prompt = prompt.value; dirtyDraft = true; });
    card.append(label, prompt);
    if (question.type === "choice") {
      card.append(make("p", "field-note", "Answer options · choose one"));
      const options = make("div", "editor-options");
      question.options.forEach((text, optionIndex) => {
        const row = make("div", "editor-option");
        row.append(make("span", "option-letter", String.fromCharCode(65 + optionIndex)));
        const input = make("input", "option-input");
        input.value = text;
        input.placeholder = "Option " + (optionIndex + 1);
        input.maxLength = 60;
        input.required = true;
        input.setAttribute("aria-label", "Question " + (index + 1) + ", option " + (optionIndex + 1));
        input.addEventListener("input", () => { question.options[optionIndex] = input.value; dirtyDraft = true; });
        row.append(input);
        if (question.options.length > 2) row.append(button("×", "remove-option", () => { question.options.splice(optionIndex, 1); dirtyDraft = true; renderEditor(); }));
        options.append(row);
      });
      card.append(options);
      if (question.options.length < 6) card.append(button("＋ Add option", "text-button add-option", () => { question.options.push(""); dirtyDraft = true; renderEditor(); }));
    } else if (question.type === "csat") {
      const preview = make("div", "scale-preview");
      for (let score = 1; score <= 5; score++) preview.append(make("span", "", String(score)));
      const captions = make("div", "csat-labels");
      captions.append(make("span", "", "Very dissatisfied"), make("span", "", "Very satisfied"));
      card.append(preview, captions);
    } else card.append(make("p", "field-note", "Customers can answer freely. Their words and voice recording will be saved."));
    $("question-editor").append(card);
  });
}
$("add-question").addEventListener("click", () => {
  if (draft.length >= 3) return;
  draft.push(newQuestion("choice"));
  dirtyDraft = true;
  renderEditor();
  $("question-editor").lastElementChild.querySelector("textarea").focus();
});

function renderSurveys() {
  const testSelected = selectedSurveyId;
  const responseSelected = $("response-survey").value || "all";
  $("saved-surveys").replaceChildren();
  $("test-survey").replaceChildren();
  $("response-survey").replaceChildren(new Option("All surveys", "all"));
  for (const survey of surveys) {
    $("test-survey").add(new Option(survey.title, survey.id));
    $("response-survey").add(new Option(survey.title, survey.id));
    const card = make("article", "saved-survey");
    card.append(make("strong", "", survey.title), make("small", "", survey.questions.length + " questions · " + languages[survey.language].name));
    const actions = make("div", "saved-survey-actions");
    actions.append(button("Test survey ↗", "text-button", () => { selectSurvey(survey.id); view("test"); }));
    actions.append(button("Responses", "text-button", () => { $("response-survey").value = survey.id; view("responses"); }));
    card.append(actions);
    $("saved-surveys").append(card);
  }
  if (!surveys.length) $("saved-surveys").append(make("p", "field-note", "Create your first survey to see it here."));
  $("test-survey").value = testSelected || "";
  if (responseSelected === "all" || surveys.some((survey) => survey.id === responseSelected)) $("response-survey").value = responseSelected;
  $("survey-total").textContent = String(surveys.length);
  $("test-empty").hidden = !!surveys.length;
  $("test-content").hidden = !surveys.length;
  controls();
}

function selectSurvey(id) {
  if (activeRun()) return;
  selectedSurveyId = id;
  const survey = currentSurvey();
  if (!survey) return;
  $("test-survey").value = id;
  $("test-heading").textContent = survey.title;
  $("test-question-count").textContent = survey.questions.length + " questions";
  updateLanguage();
  $("agent-stage").hidden = false;
  $("session").hidden = true;
  $("completion").hidden = true;
  run = null;
  status("Ready to test");
  controls();
}
$("test-survey").addEventListener("change", () => selectSurvey($("test-survey").value));
$("builder-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || activeRun() || !storageReady) return;
  const survey = {
    id: crypto.randomUUID(), title: $("survey-title").value.trim(), language: $("survey-language").value, sourceLanguage: "auto",
    questions: draft.map(({ id, type, prompt, options }) => ({
      id, type, prompt: prompt.trim(), ...(type === "choice" ? { options: options.map((option) => option.trim()) } : {}),
    })), createdAt: new Date().toISOString(),
  };
  const error = validateSurvey(survey);
  if (error) { notice(error); return; }
  busy = true; controls();
  try {
    await storage.saveSurvey(survey);
    surveys.unshift(survey);
    dirtyDraft = false;
    selectedSurveyId = survey.id;
    renderSurveys();
    notice("Survey created and saved. You can now test your agent.");
  } catch (error) { notice(error.message); }
  finally { busy = false; controls(); }
  if (currentSurvey()?.id === survey.id) { selectSurvey(survey.id); view("test"); }
});

async function request(endpoint, body) {
  let response;
  try {
    response = await fetch("/api/" + endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(65000),
    });
  } catch { throw new Error("Could not reach the voice service. Check your connection and retry."); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The voice request failed. Please try again.");
  return result;
}

async function translateQuestions(questions, language) {
  const key = JSON.stringify({ questions, language });
  if (!translations.has(key)) {
    const result = await request("prepare", { questions, language, sourceLanguage: "auto" });
    translations.set(key, validateTranslation(questions, result.questions, language));
  }
  return structuredClone(translations.get(key));
}

$("preview-translation").addEventListener("click", async () => {
  const questions = draft.map(({ id, type, prompt, options }) => ({ id, type, prompt: prompt.trim(), ...(type === "choice" ? { options: options.map((option) => option.trim()) } : {}) }));
  const error = validateSurvey({ title: $("survey-title").value, questions });
  if (error) { notice(error); return; }
  busy = true; controls(); notice();
  $("translation-preview").hidden = true;
  try {
    const language = $("survey-language").value;
    const translated = await translateQuestions(questions, language);
    const root = $("translation-questions"); root.replaceChildren();
    $("translation-heading").textContent = "Your survey in " + languages[language].name;
    translated.forEach((question, index) => {
      const card = make("article", "translation-question");
      card.lang = language;
      card.append(make("span", "answer-type", "QUESTION " + (index + 1)), make("h3", "", question.prompt));
      if (question.type === "choice") {
        const options = make("ol");
        question.options.forEach((option) => options.append(make("li", "", option)));
        card.append(options);
      }
      if (question.type === "csat") card.append(make("p", "field-note", spokenQuestion({ ...question, prompt: "" }, language).trim()));
      root.append(card);
    });
    $("translation-preview").hidden = false;
  } catch (error) { notice(error.message); }
  finally { busy = false; controls(); }
});

function clearVoice() {
  $("playback").pause();
  $("playback").removeAttribute("src");
  $("playback").hidden = true;
  if (voiceUrl) URL.revokeObjectURL(voiceUrl);
  voiceUrl = null;
}
function clearAnswerAudio() {
  $("answer-playback").pause();
  $("answer-playback").removeAttribute("src");
  $("answer-playback").hidden = true;
  if (answerUrl) URL.revokeObjectURL(answerUrl);
  answerUrl = null;
}
async function speakQuestion() {
  busy = true; controls(); notice(); status("Preparing voice…");
  try {
    if (!voiceUrl) {
      const result = await request("speak", { text: spokenQuestion(currentQuestion(), run.language), language: run.language });
      if (!result.audio) throw new Error("No audio was returned. Please retry playback.");
      const bytes = Uint8Array.from(atob(result.audio), (character) => character.charCodeAt(0));
      voiceUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      $("playback").src = voiceUrl;
    }
    $("playback").hidden = false;
    $("playback").currentTime = 0;
    try { await $("playback").play(); status("Agent speaking"); }
    catch { notice("The question is ready. Press play on the audio player to listen."); status("Ready to play"); }
  } catch (error) { notice(error.message); status("Voice unavailable"); }
  finally { busy = false; controls(); }
}
$("replay").addEventListener("click", speakQuestion);
$("playback").addEventListener("ended", () => { if (activeRun()) status("Your turn"); });

function renderOptions() {
  const question = currentQuestion();
  $("structured-options").replaceChildren();
  $("structured-options").classList.toggle("csat-options", question?.type === "csat");
  $("csat-labels").hidden = question?.type !== "csat";
  if (!question || question.type === "open") return;
  const choices = question.type === "csat" ? [1, 2, 3, 4, 5] : question.options.map((_, index) => index);
  for (const value of choices) {
    const label = question.type === "csat" ? String(value) : question.options[value];
    const option = button(label, "answer-option", () => { selectedValue = value; renderOptions(); controls(); });
    option.setAttribute("aria-pressed", String(value === selectedValue));
    option.classList.toggle("selected", value === selectedValue);
    if (question.type === "csat") option.setAttribute("aria-label", value + " out of 5");
    option.lang = run.language;
    $("structured-options").append(option);
  }
}
function showQuestion() {
  clearVoice(); clearAnswerAudio();
  selectedValue = null; recording = null;
  const question = currentQuestion();
  $("answer").value = "";
  $("answer").lang = run.language;
  $("current-question").textContent = question.prompt;
  $("current-question").lang = run.language;
  $("answer-type").textContent = questionTypes[question.type];
  $("question-count").textContent = "QUESTION " + (run.answers.length + 1) + " OF " + run.questions.length;
  $("progress").style.width = (run.answers.length / run.questions.length * 100) + "%";
  $("next").textContent = run.answers.length === run.questions.length - 1 ? "Finish & save →" : "Save & continue →";
  $("answer-label").textContent = question.type === "open" ? "YOUR ANSWER" : "VOICE TRANSCRIPT / OPTIONAL NOTE";
  $("answer-help").textContent = question.type === "open"
    ? "Record up to 25 seconds. Review the transcript before saving."
    : "Answer by voice or select above. Confirm the selected option or score before saving.";
  renderOptions(); controls();
}
$("answer").addEventListener("input", () => {
  if (currentQuestion()?.type !== "open") { selectedValue = inferAnswer(currentQuestion(), $("answer").value); renderOptions(); }
  controls();
});

$("start").addEventListener("click", async () => {
  const survey = currentSurvey();
  if (!survey || busy || activeRun()) return;
  busy = true; controls(); notice();
  try {
    const language = selectedLanguage();
    status("Translating survey into " + languages[language].name + "…");
    const questions = await translateQuestions(survey.questions, language);
    const candidate = {
      id: crypto.randomUUID(), surveyId: survey.id, surveyTitle: survey.title, isTest: true,
      customer: $("customer").value.trim() || "Admin test", region: $("region").value,
      language, sourceLanguage: "auto", originalQuestions: structuredClone(survey.questions),
      questions, answers: [], status: "in-progress", startedAt: new Date().toISOString(),
    };
    await storage.saveRun(candidate);
    run = candidate;
    runs.unshift(run);
    selectedRunId = run.id;
    $("agent-stage").hidden = true;
    $("session").hidden = false;
    $("completion").hidden = true;
    showQuestion();
  } catch (error) { notice(error.message); status("Could not start test"); }
  finally { busy = false; controls(); }
  if (activeRun()) await speakQuestion();
});

function stopTracks() {
  clearInterval(timer);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  $("recording-time").textContent = "";
}
function resetRecordingButton() {
  $("record").classList.remove("recording");
  $("record").textContent = "● Record answer";
}
function stopRecording() {
  if (!liveRecording()) return;
  busy = true; controls();
  recorder.stop();
  stopTracks();
}
function base64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the recording. Please retry."));
    reader.readAsDataURL(blob);
  });
}
$("record").addEventListener("click", async () => {
  if (liveRecording()) { stopRecording(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    notice("Microphone recording requires a supported browser on HTTPS or localhost."); return;
  }
  if (recording && !confirm("Replace the current recording for this answer?")) return;
  busy = true; controls(); notice();
  $("playback").pause(); $("answer-playback").pause();
  try {
    status("Requesting microphone…");
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error("This browser's recording format is unsupported. Try Chrome, Edge, or Safari.");
    recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
    const chunks = [];
    let failed = false;
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener("error", () => {
      failed = true; stopTracks(); recorder = null; busy = false;
      resetRecordingButton(); controls(); status("Recording interrupted");
      notice("The recording was interrupted. Please try again.");
    });
    recorder.addEventListener("stop", async () => {
      stopTracks(); resetRecordingButton();
      if (failed) return;
      busy = true; controls(); status("Transcribing answer…");
      try {
        const blob = new Blob(chunks, { type: mime });
        if (!blob.size || blob.size > 2_500_000) throw new Error("Record a shorter answer (up to 25 seconds) and try again.");
        clearAnswerAudio();
        recording = { blob, mime, transcript: "", recordedAt: new Date().toISOString() };
        $("answer").value = "";
        selectedValue = null;
        renderOptions();
        answerUrl = URL.createObjectURL(blob);
        $("answer-playback").src = answerUrl;
        $("answer-playback").hidden = false;
        const result = await request("transcribe", { audio: await base64(blob), mime, language: run.language });
        if (!result.transcript?.trim()) throw new Error("No speech was detected. Your recording is available to replay; try again or enter the answer.");
        recording.transcript = result.transcript.trim();
        $("answer").value = recording.transcript;
        selectedValue = inferAnswer(currentQuestion(), recording.transcript);
        renderOptions();
        status("Review your answer");
        if (currentQuestion().type !== "open" && selectedValue === null) notice("The voice answer needs confirmation. Select the matching option or score above.");
      } catch (error) { notice(error.message); status("Review recording / retry"); }
      finally { busy = false; recorder = null; controls(); }
    });
    recorder.start();
    const started = Date.now();
    $("record").classList.add("recording");
    $("record").textContent = "■ Stop recording";
    $("recording-time").textContent = "0 / 25s";
    status("Listening…");
    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      $("recording-time").textContent = elapsed + " / 25s";
      if (elapsed >= 25) stopRecording();
    }, 250);
  } catch (error) {
    stopTracks(); recorder = null;
    notice(error.name === "NotAllowedError" ? "Microphone access was denied. Allow it in the browser settings to record an answer." : error.name === "NotFoundError" ? "No microphone found. Connect one to record an answer." : error.message);
    status("Microphone unavailable");
  } finally { busy = false; controls(); }
});

function updateRun(saved) {
  run = saved;
  const index = runs.findIndex((item) => item.id === saved.id);
  if (index >= 0) runs[index] = saved;
  else runs.unshift(saved);
  $("nav-response-count").textContent = String(runs.reduce((sum, item) => sum + item.answers.length, 0));
}
$("next").addEventListener("click", async () => {
  const question = currentQuestion(), value = currentValue();
  if (busy || liveRecording() || !question || !validateAnswer(question, value)) return;
  let advanced = false;
  busy = true; controls(); notice(); $("playback").pause(); $("answer-playback").pause();
  try {
    const answer = {
      questionId: question.id, type: question.type, question: question.prompt,
      originalQuestion: run.originalQuestions[run.answers.length].prompt,
      value, label: answerLabel(question, value), transcript: $("answer").value.trim(),
      rawTranscript: recording?.transcript || "", recording,
      answeredAt: new Date().toISOString(),
    };
    const saved = { ...run, answers: [...run.answers, answer] };
    if (saved.answers.length === saved.questions.length) {
      saved.status = "completed"; saved.completedAt = new Date().toISOString();
    }
    await storage.saveRun(saved);
    updateRun(saved);
    advanced = true;
    if (saved.status === "completed") {
      clearVoice(); clearAnswerAudio(); recording = null;
      $("session").hidden = true; $("completion").hidden = false;
      status("Test complete · saved");
    } else showQuestion();
  } catch (error) { notice(error.message); }
  finally { busy = false; controls(); }
  if (advanced && activeRun()) await speakQuestion();
});
$("stop-test").addEventListener("click", async () => {
  if (!activeRun() || busy || liveRecording()) return;
  if (!confirm("End this test? Saved answers will remain in Responses. The current unsaved answer will be discarded.")) return;
  busy = true; controls();
  try {
    const saved = { ...run, status: "stopped", completedAt: new Date().toISOString() };
    await storage.saveRun(saved); updateRun(saved);
    clearVoice(); clearAnswerAudio(); recording = null; $("answer").value = "";
    $("session").hidden = true; $("agent-stage").hidden = false;
    status("Ready to test"); notice("Test ended. Previously saved answers are available in Responses.");
  } catch (error) { notice(error.message); }
  finally { busy = false; controls(); }
});
$("test-again").addEventListener("click", () => {
  run = null; $("answer").value = ""; $("completion").hidden = true; $("agent-stage").hidden = false;
  status("Ready to test"); notice(); controls();
});
$("view-latest").addEventListener("click", () => {
  selectedRunId = run?.id || selectedRunId;
  $("response-survey").value = run?.surveyId || "all";
  view("responses");
});

function releaseDetails() {
  detailUrls.forEach((url) => URL.revokeObjectURL(url));
  detailUrls = [];
}
function downloadJson(item) {
  const plain = { ...item, answers: item.answers.map(({ recording: audio, ...answer }, index) => ({
    ...answer, recording: audio ? { mime: audio.mime, recordedAt: audio.recordedAt, file: "answer-" + (index + 1) + "." + (audio.mime.includes("mp4") ? "m4a" : audio.mime.includes("ogg") ? "ogg" : "webm") } : null,
  })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(plain, null, 2)], { type: "application/json" }));
  const link = make("a"); link.href = url; link.download = "survey-test-" + item.id + ".json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderDetail(item) {
  releaseDetails();
  const root = $("response-detail"); root.replaceChildren();
  if (!item) {
    const empty = make("div", "empty-state");
    const text = make("p", "", "No answers yet.");
    text.append(make("small", "", "Create a survey and run a test to see the results here."));
    empty.append(make("span", "", "“"), text); root.append(empty); return;
  }
  const heading = make("div", "section-heading");
  const title = make("div"); title.append(make("span", "eyebrow", "TEST RESPONSE"), make("h2", "", item.customer));
  heading.append(title, button("Export JSON ↓", "text-button", () => downloadJson(item)));
  root.append(heading, make("p", "response-meta", item.surveyTitle + " · " + languages[item.language].name + " · " + new Date(item.startedAt).toLocaleString()));
  if (!item.answers.length) root.append(make("p", "field-note", "This test has no saved answers yet."));
  for (const [index, answer] of item.answers.entries()) {
    const card = make("article", "recorded-answer");
    card.append(make("span", "answer-type", String(index + 1).padStart(2, "0") + " · " + questionTypes[answer.type]));
    const question = make("h3", "", answer.question); question.lang = item.language; card.append(question);
    if (answer.originalQuestion !== answer.question) card.append(make("p", "original-question", "Original: " + answer.originalQuestion));
    const value = make("p", answer.type === "csat" ? "score-result" : "answer-result", answer.label);
    value.lang = item.language; card.append(value);
    if (answer.transcript && answer.type !== "open") {
      const transcript = make("p", "transcript-copy", "Transcript / note: " + answer.transcript);
      transcript.lang = item.language; card.append(transcript);
    }
    if (answer.rawTranscript && answer.rawTranscript !== answer.transcript) {
      const raw = make("p", "transcript-copy", "Original voice transcript: " + answer.rawTranscript);
      raw.lang = item.language; card.append(raw);
    }
    if (answer.recording?.blob) {
      const url = URL.createObjectURL(answer.recording.blob); detailUrls.push(url);
      const audio = make("audio"); audio.src = url; audio.controls = true; audio.preload = "none";
      audio.setAttribute("aria-label", "Recording for question " + (index + 1));
      const link = make("a", "text-button audio-download", "Download recording ↓");
      link.href = url;
      link.download = "answer-" + (index + 1) + "." + (answer.recording.mime.includes("mp4") ? "m4a" : answer.recording.mime.includes("ogg") ? "ogg" : "webm");
      card.append(audio, link);
    } else card.append(make("small", "no-recording", "Answered without a voice recording"));
    root.append(card);
  }
}
function renderResponses() {
  const filter = $("response-survey").value;
  const filtered = runs.filter((item) => filter === "all" || item.surveyId === filter);
  const answers = filtered.flatMap((item) => item.answers);
  const scores = answers.filter((answer) => answer.type === "csat").map((answer) => answer.value);
  $("metric-surveys").textContent = String(filter === "all" ? surveys.length : 1);
  $("metric-runs").textContent = String(filtered.length);
  $("metric-answers").textContent = String(answers.length);
  $("metric-csat").textContent = scores.length ? (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1) + " / 5" : "—";
  $("nav-response-count").textContent = String(runs.reduce((sum, item) => sum + item.answers.length, 0));
  $("runs-count").textContent = String(filtered.length);
  $("runs-list").replaceChildren();
  if (!filtered.some((item) => item.id === selectedRunId)) selectedRunId = filtered[0]?.id || null;
  for (const item of filtered) {
    const row = button("", "run-row", () => { selectedRunId = item.id; renderResponses(); });
    row.classList.toggle("selected", selectedRunId === item.id);
    row.append(make("strong", "", item.customer), make("small", "", item.surveyTitle), make("span", "run-meta", new Date(item.startedAt).toLocaleDateString() + " · " + item.answers.length + "/" + item.questions.length + " answers"));
    row.append(make("span", "tag", item.status === "completed" ? "Test · complete" : item.status === "stopped" ? "Test · ended" : "Test · partial"));
    $("runs-list").append(row);
  }
  if (!filtered.length) $("runs-list").append(make("p", "field-note", "Your test sessions will appear here."));
  renderDetail(filtered.find((item) => item.id === selectedRunId));
}
$("response-survey").addEventListener("change", renderResponses);

window.addEventListener("beforeunload", (event) => {
  if (dirtyDraft || (activeRun() && ($("answer").value.trim() || recording || selectedValue !== null))) {
    event.preventDefault(); event.returnValue = "";
  }
});
window.addEventListener("pagehide", () => { stopTracks(); releaseDetails(); });
async function init() {
  renderEditor(); updateLanguage(); controls();
  try {
    [surveys, runs] = await Promise.all([storage.surveys(), storage.runs()]);
    surveys.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    storageReady = true;
    selectedSurveyId = surveys[0]?.id || null;
    renderSurveys();
    if (selectedSurveyId) selectSurvey(selectedSurveyId);
    renderResponses();
  } catch (error) { notice(error.message || "Browser storage is unavailable. Enable site storage and reload."); }
  controls();
}
init();
