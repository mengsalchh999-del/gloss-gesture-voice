// GLOSS: MediaPipe hand gesture -> phrase -> speech prototype.
// Five example mappings only. NOT a sign-language or emotion translator.
let FilesetResolver;
let GestureRecognizer;
let FaceLandmarker;

const VERSION = "0.10.34";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HOLD_DURATION = 850;
const MIN_CONFIDENCE = 0.65;
const NO_GESTURE_RESET_MS = 650;
const STORAGE_KEY = "gloss_phrase_mappings_v1";
const DEFAULT_PHRASES = {
  Open_Palm: "Hello.",
  Closed_Fist: "Stop.",
  Thumb_Up: "Yes!",
  Victory: "Thank you.",
  Pointing_Up: "I need help.",
};
const GESTURE_NAMES = {
  Open_Palm: "Open palm",
  Closed_Fist: "Closed fist",
  Thumb_Up: "Thumbs up",
  Victory: "Victory",
  Pointing_Up: "Pointing up",
};
const GESTURE_EMOJI = {
  Open_Palm: "✋",
  Closed_Fist: "✊",
  Thumb_Up: "👍",
  Victory: "✌️",
  Pointing_Up: "☝️",
};
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];

const $ = (id) => document.getElementById(id);
const video = $("webcam");
const canvas = $("trackingCanvas");
const ctx = canvas.getContext("2d");

let stream = null;
let gestureRecognizer = null;
let faceLandmarker = null;
let active = false;
let starting = false;
let frameId = 0;
let lastVideoTime = -1;
let lastHandDetection = -Infinity;
let lastFaceDetection = -Infinity;
let currentCandidate = null;
let candidateSince = 0;
let lastCommitted = null;
let lostSince = 0;
let currentPhrase = "";
let showLandmarks = true;
let mirrored = true;
let mappings = loadMappings();
let lastHandResult = null;
let lastFaceResult = null;
const history = [];

function loadMappings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const result = { ...DEFAULT_PHRASES };
    for (const name of Object.keys(result)) {
      if (typeof stored[name] === "string" && stored[name].trim()) {
        result[name] = stored[name].trim().slice(0, 100);
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_PHRASES };
  }
}

function message(text, isError = false) {
  $("alert").textContent = text;
  $("alert").classList.toggle("error", isError);
}
function setModelStatus(text) { $("modelStatus").textContent = text; }
function pipeline(id, on) { $(id).classList.toggle("on", Boolean(on)); }
function showConfidence(score) { $("confidenceCaption").textContent = `${Math.round(score * 100)}%`; }
function setPhrase(text, gestureLabel) {
  $("spokenPhrase").textContent = text;
  $("spokenSub").textContent = gestureLabel;
  $("speakAgain").disabled = false;
  currentPhrase = text;
}
function clock() {
  $("clock").textContent = new Date().toLocaleTimeString([], {hour12:false});
}
clock();
setInterval(clock, 1000);

function renderEditor() {
  const editor = $("mappingEditor");
  editor.replaceChildren();
  for (const [gesture, label] of Object.entries(GESTURE_NAMES)) {
    const row = document.createElement("div");
    row.className = "map-row";
    const name = document.createElement("label");
    const id = `map-${gesture}`;
    name.htmlFor = id;
    name.textContent = label;
    const input = document.createElement("input");
    input.id = id;
    input.maxLength = 100;
    input.value = mappings[gesture];
    input.setAttribute("aria-label", `${label} spoken phrase`);
    row.append(name, input);
    editor.append(row);
  }
}
renderEditor();

$("saveMappings").addEventListener("click", () => {
  const saved = {};
  for (const name of Object.keys(DEFAULT_PHRASES)) {
    const text = $(`map-${name}`).value.trim();
    if (!text) {
      message(`Please enter a phrase for ${GESTURE_NAMES[name]}.`, true);
      return;
    }
    saved[name] = text.slice(0, 100);
  }
  mappings = saved;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    message("Your five phrase mappings are saved in this browser.");
  } catch {
    message("Mappings are updated for this session, but browser storage is unavailable.");
  }
  document.querySelectorAll(".gesture-card").forEach((card, index) => {
    card.querySelector("strong").textContent = mappings[Object.keys(DEFAULT_PHRASES)[index]];
  });
});
for (const [index, name] of Object.keys(DEFAULT_PHRASES).entries()) {
  document.querySelectorAll(".gesture-card")[index].querySelector("strong").textContent = mappings[name];
}

function updateCameraUI(running) {
  active = running;
  $("cameraStage").classList.toggle("active", running);
  $("liveDot").classList.toggle("on", running);
  $("studioStatus").textContent = running ? "DETECTING" : "STANDBY";
  $("cameraTag").textContent = running ? "ONLINE" : "OFFLINE";
  $("cameraButton").classList.toggle("stop", running);
  $("cameraButtonLabel").textContent = running ? "Stop camera" : "Start camera";
  $("cameraButtonIcon").textContent = running ? "■" : "◉";
  $("idleStart").disabled = starting;
  $("cameraButton").disabled = starting;
  pipeline("handPipeline", running);
  pipeline("voicePipeline", running && $("speechToggle").checked && "speechSynthesis" in window);
  if (!running) {
    $("detectionBubble").hidden = true;
    $("frameCount").textContent = "NO HAND DETECTED";
    pipeline("facePipeline", false);
    pipeline("phrasePipeline", false);
    clearCues();
  }
}

async function initializeModels() {
  if (gestureRecognizer) return;
  setModelStatus("LOADING HAND MODEL...");
  // Lazy load so the interface stays usable if the user is offline.
  const mediapipe = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`);
  ({ FilesetResolver, GestureRecognizer, FaceLandmarker } = mediapipe);
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  // CPU mode works broadly, including Macs without a supported WebGL configuration.
  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: "CPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  setModelStatus("LOADING FACE MODEL...");
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
    });
    setModelStatus("HAND + FACE READY");
  } catch (error) {
    console.warn("Face analysis is unavailable; hand detection will continue:", error);
    setModelStatus("HAND MODEL READY");
    message("Hand tracking is available. Facial cues could not be loaded.");
  }
}

async function startCamera() {
  if (active || starting) return;
  starting = true;
  $("cameraButton").disabled = true;
  $("idleStart").disabled = true;
  $("cameraButtonLabel").textContent = "Starting...";
  message("Requesting webcam permission and loading Google's vision models...");
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera requires HTTPS or localhost. Please open this app from http://localhost:8000.");
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: {ideal:1280}, height: {ideal:720} },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    await initializeModels();
    if (video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    lastVideoTime = -1;
    lastHandResult = null;
    lastFaceResult = null;
    currentCandidate = null;
    lastCommitted = null;
    lostSince = 0;
    updateCameraUI(true);
    message("Camera is live. Hold a listed gesture steady for about one second.");
    frameId = requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    releaseStream();
    updateCameraUI(false);
    setModelStatus(gestureRecognizer ? "MODEL READY" : "MODELS NOT LOADED");
    message(`Could not start camera: ${error.message || "Unknown error"}. Check permission and internet access.`, true);
  } finally {
    starting = false;
    $("cameraButton").disabled = false;
    $("idleStart").disabled = false;
    if (!active) $("cameraButtonLabel").textContent = "Start camera";
  }
}
function releaseStream() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.pause();
  video.srcObject = null;
}
function stopCamera() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  active = false;
  releaseStream();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  lastHandResult = null;
  lastFaceResult = null;
  currentCandidate = null;
  lastCommitted = null;
  lostSince = 0;
  updateCameraUI(false);
  setModelStatus(gestureRecognizer ? "MODELS READY" : "MODELS NOT LOADED");
  message("Camera stopped. No webcam video has been saved or uploaded by this app.");
}
$("cameraButton").addEventListener("click", () => active ? stopCamera() : startCamera());
$("idleStart").addEventListener("click", startCamera);
$("mirrorButton").addEventListener("click", () => {
  mirrored = !mirrored;
  video.style.transform = mirrored ? "scaleX(-1)" : "none";
  canvas.style.transform = mirrored ? "scaleX(-1)" : "none";
  message(mirrored ? "Mirror view enabled." : "Mirror view disabled.");
});
$("landmarksButton").addEventListener("click", () => {
  showLandmarks = !showLandmarks;
  $("landmarksButton").setAttribute("aria-pressed", String(showLandmarks));
  if (!showLandmarks) ctx.clearRect(0, 0, canvas.width, canvas.height);
});
$("speechToggle").addEventListener("change", () => {
  const enabled = $("speechToggle").checked;
  pipeline("voicePipeline", active && enabled && "speechSynthesis" in window);
  if (!enabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
  message(enabled ? "Automatic voice enabled." : "Automatic voice muted. Replay is still available.");
});

function drawLine(a, b, color = "#b8ffe5", lineWidth = 2) {
  ctx.beginPath();
  ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
  ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}
function drawHands(result) {
  if (!result?.landmarks) return;
  for (const [index, hand] of result.landmarks.entries()) {
    ctx.shadowBlur = 11;
    ctx.shadowColor = "rgba(172,255,215,.45)";
    for (const [start, end] of HAND_CONNECTIONS) drawLine(hand[start], hand[end], "rgba(173,255,218,.93)", 2.6);
    ctx.shadowBlur = 0;
    for (const point of hand) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 3.7, 0, 2 * Math.PI);
      ctx.fillStyle = "#e6fff1";
      ctx.fill();
    }
    const x = Math.min(...hand.map(p => p.x)) * canvas.width;
    const y = Math.min(...hand.map(p => p.y)) * canvas.height;
    const label = `HAND ${index + 1} / TRACKING`;
    ctx.font = "bold 13px Arial";
    ctx.fillStyle = "rgba(12,24,21,.84)";
    ctx.fillRect(Math.max(4, x), Math.max(4, y - 29), 158, 24);
    ctx.fillStyle = "#b5ffda";
    ctx.fillText(label, Math.max(4, x) + 8, Math.max(4, y - 29) + 16);
  }
}
function drawFaces(result) {
  if (!result?.faceLandmarks?.length) return;
  for (const face of result.faceLandmarks) {
    ctx.fillStyle = "rgba(230,205,255,.72)";
    for (let i = 0; i < face.length; i += 3) {
      const p = face[i];
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 1.3, 0, Math.PI*2);
      ctx.fill();
    }
    if (FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
      for (const line of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
        drawLine(face[line.start], face[line.end], "rgba(218,192,255,.38)", 1.2);
      }
    }
    const minX = Math.min(...face.map(p => p.x)) * canvas.width;
    const maxX = Math.max(...face.map(p => p.x)) * canvas.width;
    const minY = Math.min(...face.map(p => p.y)) * canvas.height;
    const maxY = Math.max(...face.map(p => p.y)) * canvas.height;
    ctx.strokeStyle = "rgba(236,216,255,.45)";
    ctx.lineWidth = 1.3;
    ctx.strokeRect(minX-7, minY-7, maxX-minX+14, maxY-minY+14);
  }
}
function blendshapeValue(result, name) {
  return result.faceBlendshapes?.[0]?.categories?.find(c => c.categoryName === name)?.score ?? 0;
}
function setMeter(prefix, value) {
  const clamped = Math.max(0, Math.min(1, value));
  $(`${prefix}Meter`).style.width = `${Math.round(clamped * 100)}%`;
  $(`${prefix}Value`).textContent = `${Math.round(clamped * 100)}%`;
}
function clearCues() {
  $("cueTitle").textContent = faceLandmarker ? "No face detected" : "Face model unavailable";
  $("cueSubtitle").textContent = "Optional visual signals";
  $("cueOrb").textContent = "✳";
  for (const prefix of ["smile", "brow", "mouth"]) {
    $(`${prefix}Meter`).style.width = "0%";
    $(`${prefix}Value`).textContent = "—";
  }
}
function updateFace(result) {
  const found = Boolean(result?.faceLandmarks?.length);
  pipeline("facePipeline", found);
  if (!found) { clearCues(); return; }
  const smile = (blendshapeValue(result,"mouthSmileLeft") + blendshapeValue(result,"mouthSmileRight"))/2;
  const brow = Math.max(blendshapeValue(result,"browInnerUp"),blendshapeValue(result,"browOuterUpLeft"),blendshapeValue(result,"browOuterUpRight"));
  const mouth = blendshapeValue(result,"jawOpen");
  setMeter("smile", smile);
  setMeter("brow", brow);
  setMeter("mouth", mouth);
  const top = [{name:"Smile cue",value:smile,icon:"☺"},{name:"Brows raised",value:brow,icon:"⌃"},{name:"Mouth open",value:mouth,icon:"◉"}]
    .sort((a,b)=>b.value-a.value)[0];
  const strongCue = top.value >= 0.35;
  $("cueTitle").textContent = strongCue ? top.name : "Neutral movement";
  $("cueSubtitle").textContent = strongCue ? "Facial motion detected" : "Face tracked";
  $("cueOrb").textContent = strongCue ? top.icon : "◎";
}

function updateCandidate(gesture, score, now) {
  const valid = gesture && Object.hasOwn(mappings, gesture) && score >= MIN_CONFIDENCE;
  pipeline("phrasePipeline", valid);
  if (!valid) {
    $("detectionBubble").hidden = true;
    currentCandidate = null;
    if (!lostSince) lostSince = now;
    if (now - lostSince > NO_GESTURE_RESET_MS) lastCommitted = null;
    document.querySelectorAll(".gesture-card").forEach(el => el.classList.remove("highlight"));
    return;
  }
  lostSince = 0;
  if (gesture !== currentCandidate) {
    currentCandidate = gesture;
    candidateSince = now;
  }
  const progress = Math.min(1, (now - candidateSince) / HOLD_DURATION);
  $("detectionBubble").hidden = false;
  $("bubbleGesture").textContent = GESTURE_NAMES[gesture];
  showConfidence(score);
  $("holdProgress").style.width = `${Math.round(progress * 100)}%`;
  $("holdLabel").textContent = progress >= 1 ? "Gesture confirmed" : "Hold steady to confirm";
  document.querySelectorAll(".gesture-card").forEach((el, idx) => {
    el.classList.toggle("highlight",Object.keys(DEFAULT_PHRASES)[idx] === gesture);
  });
  if (progress >= 1 && gesture !== lastCommitted) {
    lastCommitted = gesture;
    commitGesture(gesture, score);
  }
}

function commitGesture(gesture, score) {
  const phrase = mappings[gesture];
  setPhrase(phrase, `${GESTURE_EMOJI[gesture]}  ${GESTURE_NAMES[gesture]} · ${Math.round(score*100)}% model confidence`);
  history.unshift({phrase, time:new Date(), gesture});
  if (history.length > 7) history.pop();
  renderHistory();
  if ($("speechToggle").checked) speak(phrase);
  message(`Recognized ${GESTURE_NAMES[gesture]} at ${Math.round(score*100)}% model confidence. ${$("speechToggle").checked ? "Speaking phrase." : "Voice is muted."}`);
}
function renderHistory() {
  const list = $("historyList");
  list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "No messages yet. Try a gesture!";
    list.append(empty);
    return;
  }
  for (const item of history) {
    const row = document.createElement("div");
    row.className = "history-item";
    const phrase = document.createElement("span");
    phrase.className = "history-phrase";
    phrase.textContent = `${GESTURE_EMOJI[item.gesture]}  ${item.phrase}`;
    const time = document.createElement("span");
    time.className = "history-time";
    time.textContent = item.time.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    row.append(phrase,time);
    list.append(row);
  }
}
$("clearHistory").addEventListener("click", () => {
  history.length = 0;
  renderHistory();
  message("Session message history cleared.");
});

function speak(text) {
  if (!("speechSynthesis" in window)) {
    $("speechState").textContent = "VOICE UNSUPPORTED";
    message("Your browser doesn't support text-to-speech. Try Google Chrome.", true);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.93;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => { $("speechState").textContent = "SPEAKING..."; };
  utterance.onend = () => { $("speechState").textContent = "VOICE READY"; };
  utterance.onerror = () => { $("speechState").textContent = "VOICE UNAVAILABLE"; };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
$("speakAgain").addEventListener("click", () => { if (currentPhrase) speak(currentPhrase); });

function renderLoop(now) {
  if (!active) return;
  frameId = requestAnimationFrame(renderLoop);
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  }
  // Limit inference frequency to keep the UI responsive on ordinary laptops.
  let newHandResult = null;
  let newFaceResult = null;
  try {
    if (now - lastHandDetection >= 95) {
      newHandResult = gestureRecognizer.recognizeForVideo(video, now);
      lastHandDetection = now;
      const gestures = newHandResult.gestures || [];
      const candidates = gestures.map(g => g[0]).filter(Boolean).filter(g => g.categoryName !== "None");
      const best = candidates.sort((a,b) => b.score-a.score)[0];
      $("frameCount").textContent = `${newHandResult.landmarks?.length || 0} HAND(S) DETECTED`;
      updateCandidate(best?.categoryName, best?.score || 0, now);
    }
    if (faceLandmarker && now - lastFaceDetection >= 170) {
      newFaceResult = faceLandmarker.detectForVideo(video, now);
      lastFaceDetection = now;
      updateFace(newFaceResult);
    }
    // Keep last geometry between inference frames for stable drawing.
    if (newHandResult) lastHandResult = newHandResult;
    if (newFaceResult) lastFaceResult = newFaceResult;
    if (showLandmarks) {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      drawFaces(lastFaceResult);
      drawHands(lastHandResult);
    }
  } catch (error) {
    console.error("MediaPipe inference error", error);
    message("Recognition stopped due to a model error. Try restarting the camera.", true);
    stopCamera();
  }
}
window.addEventListener("pagehide", () => { if (active) stopCamera(); });
