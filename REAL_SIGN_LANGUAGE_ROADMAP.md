# GLOSS — Real Sign Language Recognition Roadmap

**Status:** Research and engineering plan, not a trained sign-language model. Existing GLOSS recognizes 5 generic MediaPipe gestures mapped to demonstration phrases. Those mappings are not authentic signs.

## Product goal

Support real, distinct sign languages with honest model capabilities:
- **ASL research prototype first** using verified American Sign Language videos to establish a reproducible training pipeline.
- **Khmer Sign Language (KSL) track** developed with native signers and Khmer Deaf organizations/teachers once labels and data permissions are validated.
- Users may keep separate **personal custom gestures**, clearly distinguished from any verified language and never labeled as ASL or KSL without validation.

## What GLOSS v3 will actually do

1. User selects an explicitly supported language/model.
2. Webcam runs with consent over HTTPS; MediaPipe tracks two hands, upper-body pose, and face features as supported by the model.
3. A sliding temporal window of landmarks (not a single static hand pose) is passed to a **trained isolated-sign recognition model**.
4. An **unknown / low confidence** state is displayed rather than guessing. Show candidate gloss and confidence as model output, not guaranteed truth.
5. Once stable, show the recognized meaning and allow the user to confirm/edit it before speaking. Speak using browser voice; optional cloud voice uses a secure backend, not a public Pages API key.
6. Keep **full continuous sign-language translation** a distinct, future research goal; not the first release.

## Dataset evidence and permission

- WLASL: https://dxli94.github.io/WLASL/ — 2,000 ASL word classes, research/noncommercial restrictions stated on official page. WLASL is word-level isolated signing, **not sentence translation**. Check licenses, splits, availability, and vocabulary for actual model training.
- How2Sign: https://how2sign.github.io/ — 80+ hours of ASL video with sentence data and other modalities, primarily for research and noncommercial use. Much heavier than an initial prototype.
- Khmer sign-language community collection effort: https://github.com/sengtha/iAny/blob/main/docs/SIGN-COLLECTION.md — promising collection workflow and plans, not evidence that a sufficiently large, validated, readily usable dataset/model exists.
- Cambodia research baseline: https://www.idri.edu.kh/events/acet-2025/publication-articles/ — small dataset work indicates an emerging research field. Verify permission and data before use.

## Recommended milestones

### M1 — One-language, word-level research demo
- Choose 20–30 authentic ASL signs from legally usable sources and verify their glosses with a proficient signer.
- Build reproducible Python extraction using MediaPipe Hands/Face/Pose across **video sequences**. Track one or two hands, movement, temporal order and optionally facial/pose cues.
- Normalize keypoints relative to stable body/hand references while preserving meaningful direction and motion.
- Train a time-series classifier (1D-CNN, GRU, or a small Transformer) offline, including an **unknown** class and sign-boundary detection.
- Evaluate with **signer-independent** train/validation/test split: accuracy, per-class precision/recall, false positives on unknown/idle signing, and latency. Never report accuracy before evaluating.
- Export a browser-compatible model (TF.js / ONNX Runtime Web or another supported runtime) and document compatible model versions and memory use.
- Add explicit model-load UI, word recognition history, edit/confirm before speaking, and clearly identify the supported vocabulary.

### M2 — Growth and usability
- Increase vocabulary only when class-level evaluation supports it.
- Add repeatable data collection with metadata, explicit consent, export, quality checks, and multi-signer variation.
- Keep original custom training in a separate tab and label it "Personal gestures" rather than "Sign language".
- Support dynamic signing, left/right variation, appropriate phrase handling, and low-latency inference.

### M3 — Khmer Sign Language
- Partner with Deaf/KSL-fluent contributors and educators for vocabulary validation and regional variation.
- Collect consented video or movement sequences with privacy controls, governance, and documented usage rights. Hand-only landmarks may miss facial/grammatical signals.
- Train/test with different signers in the Cambodian context, include Khmer display and appropriate voice options.
- Do not assume ASL signs transfer directly to KSL.

### M4 — Research: continuous signed sentences
- Define a distinct sequence segmentation + gloss or direct translation pipeline.
- Include facial grammar, both hands, posture and timing, sentence context.
- Any language model should be limited to clarifying confidently recognized signing; it must not invent missing information.

## Deployment architecture

GitHub Pages hosts the public HTML/CSS/JS client and small static inference model files. Training happens offline / in a separate environment. If online model services or premium cloud TTS are added, deploy a secure backend with access controls, no secret API keys in the Pages repository, and clear opt-in data policy.

## Communication and accessibility safeguards

- Avoid claiming GLOSS replaces interpreters, handles emergencies, or is a full sign-language translator.
- Support visible captions, a confidence/uncertain state, correction and manual text entry, and audio feedback controls.
- Avoid interpreting facial-expression scores as a person's emotional state.
- Collaborate with native signers and test with diverse participants; preserve consent and honor dataset usage restrictions.
