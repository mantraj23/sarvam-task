import { languages, regions, resolveLanguage } from "./survey.js";

const $ = (id) => document.getElementById(id);
let session = null;
let index = 0;
let busy = false;
let recorder = null;
let stream = null;
let timer = null;
let audioUrl = null;
let recordingStarted = 0;
let displayedLanguage = null;
const profileFields = [$("customer"), $("region"), $("language"), $("questions")];

for (const region of Object.keys(regions)) $("region").add(new Option(region, region));
for (const [code, language] of Object.entries(languages)) {
  $("language").add(new Option(`${language.name} · ${language.native}`, code));
}

function selectedLanguage() { return resolveLanguage($("language").value, $("region").value); }

function updateLanguage() {
  const code = selectedLanguage();
  const language = languages[code];
  $("resolved-language").textContent = `${language.name} · ${language.native}`;
  $("language-glyph").textContent = code === "en-IN" ? "Aa" : language.native.slice(0, 2);
  $("language-source").textContent = $("language").value === "auto" ? "Suggested from region · change anytime" : "From customer profile";
  $("session-language").textContent = `${language.name} · ${code}`;
  if (code !== displayedLanguage) $("questions").value = language.questions.join("\n");
  displayedLanguage = code;
  $("questions").lang = code;
}

function notice(message = "") {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}

function syncControls() {
  const recording = recorder?.state === "recording";
  $("start").disabled = busy;
  $("next").disabled = busy || recording || !$("answer").value.trim();
  $("record").disabled = busy;
  $("replay").disabled = busy || recording;
  $("answer").disabled = busy || recording;
  $("reset").disabled = busy || recording;
  $("agent-stage").classList.toggle("busy", busy);
}

function status(text) { $("status-pill").textContent = text; }

async function request(endpoint, body) {
  let response;
  try {
    response = await fetch(`/api/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(65000),
    });
  } catch {
    throw new Error("Could not reach the voice service. Check your connection and try again.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The voice request failed. Please try again.");
  return result;
}

function clearAudio() {
  $("playback").pause();
  $("playback").removeAttribute("src");
  $("playback").hidden = true;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

async function speakQuestion() {
  busy = true;
  syncControls();
  notice();
  status("Preparing voice…");
  try {
    if (!audioUrl) {
      const { audio } = await request("speak", { text: session.questions[index], language: session.language });
      if (!audio) throw new Error("No audio was returned. You can retry the question or answer by typing.");
      const bytes = Uint8Array.from(atob(audio), (character) => character.charCodeAt(0));
      audioUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      $("playback").src = audioUrl;
    }
    $("playback").hidden = false;
    $("playback").currentTime = 0;
    try { await $("playback").play(); status("Speaking your language"); }
    catch { notice("Your question is ready. Press play on the audio player to listen."); status("Ready to play"); }
  } catch (error) {
    notice(error.message);
    status("Voice unavailable");
  } finally { busy = false; syncControls(); }
}

function showQuestion() {
  clearAudio();
  $("answer").value = "";
  $("answer").lang = session.language;
  $("current-question").textContent = session.questions[index];
  $("current-question").lang = session.language;
  $("question-count").textContent = `QUESTION ${index + 1} OF ${session.questions.length}`;
  $("progress").style.width = `${(index / session.questions.length) * 100}%`;
  $("next").replaceChildren(document.createTextNode(index === session.questions.length - 1 ? "Finish survey  ✓" : "Save & continue  →"));
  syncControls();
}

$("start").addEventListener("click", async () => {
  const questions = $("questions").value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!questions.length || questions.length > 10 || questions.some((question) => question.length > 1000)) {
    $("survey-settings").open = true;
    notice("Add between 1 and 10 questions, with up to 1,000 characters in each question.");
    $("questions").focus();
    return;
  }
  session = {
    customer: $("customer").value.trim(), region: $("region").value,
    language: selectedLanguage(), questions, responses: [],
    startedAt: new Date().toISOString(),
  };
  index = 0;
  for (const field of profileFields) field.disabled = true;
  $("agent-stage").hidden = true;
  $("session").hidden = false;
  showQuestion();
  await speakQuestion();
});

$("replay").addEventListener("click", speakQuestion);
$("answer").addEventListener("input", syncControls);
$("playback").addEventListener("ended", () => status("Your turn"));
$("playback").addEventListener("error", () => {
  if (audioUrl) notice("Audio playback failed. You can still read the question and record or type your answer.");
});

function stopTracks() {
  clearInterval(timer);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  $("recording-time").textContent = "";
}

function stopRecording() {
  if (recorder?.state !== "recording") return;
  busy = true;
  syncControls();
  recorder.stop();
  stopTracks();
}

function resetRecordButton() {
  $("record").classList.remove("recording");
  $("record").textContent = "● Record answer";
}

function encodeAudio(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the recording. Please record again."));
    reader.readAsDataURL(blob);
  });
}

$("record").addEventListener("click", async () => {
  if (recorder?.state === "recording") { stopRecording(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    notice("Voice recording needs a supported browser on HTTPS or localhost. You can type your answer below.");
    return;
  }
  notice();
  $("playback").pause();
  busy = true;
  syncControls();
  status("Requesting microphone…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error("This browser’s recording format is not supported. Please try Chrome, Edge, or Safari, or type your answer.");
    recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
    const chunks = [];
    let recordingFailed = false;
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener("error", () => {
      recordingFailed = true;
      stopTracks();
      recorder = null;
      busy = false;
      resetRecordButton();
      syncControls();
      status("Recording interrupted");
      notice("Recording was interrupted. Please try again, or type your answer.");
    });
    recorder.addEventListener("stop", async () => {
      stopTracks();
      resetRecordButton();
      if (recordingFailed) return;
      busy = true;
      syncControls();
      status("Transcribing answer…");
      try {
        const blob = new Blob(chunks, { type: mime });
        if (!blob.size) throw new Error("No audio was recorded. Please try again.");
        if (blob.size > 2_500_000) throw new Error("This recording is too large. Try a shorter answer.");
        const audio = await encodeAudio(blob);
        const result = await request("transcribe", { audio, mime, language: session.language });
        if (!result.transcript?.trim()) throw new Error("No speech was detected. Please try again, or type your answer.");
        $("answer").value = [$("answer").value.trim(), result.transcript.trim()].filter(Boolean).join(" ");
        status("Review your answer");
        $("answer").focus();
      } catch (error) { notice(error.message); status("Please try again"); }
      finally { busy = false; recorder = null; syncControls(); }
    });
    recorder.start();
    recordingStarted = Date.now();
    $("record").classList.add("recording");
    $("record").textContent = "■ Stop recording";
    $("recording-time").textContent = "0 / 25s";
    status("Listening…");
    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStarted) / 1000);
      $("recording-time").textContent = `${elapsed} / 25s`;
      if (elapsed >= 25) stopRecording();
    }, 250);
  } catch (error) {
    stopTracks();
    recorder = null;
    notice(error.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser settings, or type your answer." : error.name === "NotFoundError" ? "No microphone was found. Connect one, or type your answer." : error.message || "Could not start recording.");
    status("Microphone unavailable");
  } finally { busy = false; syncControls(); }
});

function renderResponses() {
  $("transcript").replaceChildren();
  session.responses.forEach((response, position) => {
    const row = document.createElement("article");
    row.className = "response-row";
    const number = document.createElement("span");
    number.className = "response-number";
    number.textContent = String(position + 1).padStart(2, "0");
    const content = document.createElement("div");
    content.lang = session.language;
    const question = document.createElement("h3");
    question.textContent = response.question;
    const answer = document.createElement("p");
    answer.textContent = response.answer;
    content.append(question, answer);
    row.append(number, content);
    $("transcript").append(row);
  });
}

$("next").addEventListener("click", async () => {
  if (busy || recorder?.state === "recording" || !$("answer").value.trim()) return;
  session.responses.push({ question: session.questions[index], answer: $("answer").value.trim(), answeredAt: new Date().toISOString() });
  renderResponses();
  index += 1;
  if (index >= session.questions.length) {
    clearAudio();
    notice();
    $("session").hidden = true;
    $("completion").hidden = false;
    status("Survey complete");
    session.completedAt = new Date().toISOString();
    $("download").focus();
  } else { showQuestion(); await speakQuestion(); }
});

$("download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `survey-${session.startedAt.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("reset").addEventListener("click", () => {
  if (session && !confirm("Start a new session? Download completed responses first if you want to keep them.")) return;
  clearAudio();
  stopTracks();
  session = null;
  index = 0;
  $("answer").value = "";
  for (const field of profileFields) field.disabled = false;
  $("agent-stage").hidden = false;
  $("session").hidden = true;
  $("completion").hidden = true;
  $("transcript").replaceChildren();
  const empty = document.createElement("p");
  empty.className = "field-note";
  empty.textContent = "Your conversation will appear here. Answers stay in this tab until you download or reset them.";
  $("transcript").append(empty);
  notice();
  status("Ready when you are");
  syncControls();
});

$("region").addEventListener("change", updateLanguage);
$("language").addEventListener("change", updateLanguage);
window.addEventListener("beforeunload", (event) => {
  if (session?.responses.length || $("answer").value.trim()) { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("pagehide", stopTracks);
updateLanguage();
syncControls();
