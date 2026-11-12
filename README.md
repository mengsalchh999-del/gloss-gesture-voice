# GLOSS — Hand Gesture to Speech (MediaPipe Demo)

A stylish, webcam-based gesture-recognition web prototype inspired by the supplied concept video.

## Features

- Google MediaPipe Gesture Recognizer recognizes five **built-in** gestures: Open Palm, Closed Fist, Thumb Up, Victory, Pointing Up.
- Shows hand landmark skeletons on top of the mirrored live webcam feed.
- Optional MediaPipe Face Landmarker shows **facial movement cues** (smile, raised brows, open mouth). These do **not** classify emotions, intentions, or sign-language grammar.
- Maps recognized gestures to example phrases, which the browser reads aloud with the Web Speech API.
- Recognizes only after a gesture remains steady for ~0.85 seconds; no constant repeat while the gesture is held.
- You can edit the five **phrase mappings**; changes are stored in your browser's localStorage.
- Start/stop camera, mirror toggle, overlay toggle, voice toggle, replay, message history.
- Runs entirely in the browser; no API key or paid LLM needed.

## Run it on Mac or Windows

1. Download and extract `gloss-gesture-voice.zip`.
2. Open Terminal (Mac), or a terminal (Windows), and move into the extracted folder:

   ```bash
   cd /path/to/gloss-gesture-voice
   ```
3. Start a local web server using Python 3:

   ```bash
   python3 -m http.server 8000
   ```

   Windows may use `python -m http.server 8000` instead.

4. Open **http://localhost:8000** in **Chrome or Edge** (Safari may work too).
5. Click **Start camera**, allow the webcam permission, and wait for MediaPipe models to load.
6. Hold one gesture steady for about a second until it is confirmed.

**Important:** This application needs internet access to download MediaPipe JavaScript/WASM and Google's `.task` model files. It does **not** require an OpenAI API key. Run from `localhost` or HTTPS: opening `index.html` as `file://` is not supported because module loading / camera access may fail.

## What it can and can't do

This is a **demo of five static gesture categories** with user-defined spoken phrases. It is **not** a full ASL, Cambodian Sign Language, or universal sign-language translator. The word mappings are **not** claimed to be authentic signs. Dynamic sign languages require curated datasets and temporal hand, body, and face processing, ideally developed with native sign-language users. MediaPipe face blendshapes measure visible facial movements, **not emotional state**. There is no LLM in this version.

The **phrase editor is NOT a machine-learning training workflow**. To recognize new gestures beyond the built-in MediaPipe classes, the next version needs a dataset collector and a separate classifier or a custom MediaPipe Gesture Recognizer model.

## Privacy and accessibility

Camera processing happens locally in the browser after external model files load. The application doesn't intentionally upload camera frames or save videos. Speech plays locally using the installed browser/system voices. Phrase mappings persist in localStorage; the session history is ephemeral and clears on reload. The site does not send frames to an LLM.

## Technical architecture

- `index.html`: accessible interface
- `styles.css`: responsive styling
- `app.js`: MediaPipe Gesture Recognizer + Face Landmarker inference, overlay, gesture stabilizer, speech, local phrase mappings
- MediaPipe Tasks Vision package: `@mediapipe/tasks-vision@0.10.34` from jsDelivr CDN
- Models: official Google-hosted `.task` files
- Web Speech API: built-in browser speech synthesis

MediaPipe reference: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js

## Debugging

- **Permission denied:** allow camera in browser settings and close apps using the webcam.
- **No speech:** turn on Auto Voice, check your device sound, and use the Speak again button.
- **Models not loading:** confirm internet access and reload; the CDN and model URLs must be reachable.
- **No recognized gesture:** make your hand well lit, keep it entirely in frame, try the five built-in gestures only, and hold steady.
- **Face cues unavailable:** the optional face model may not load on all devices. Hand recognition can still work.
- **Slow frame rate:** toggle off landmark overlay, close other camera-consuming applications, use a modern browser.
