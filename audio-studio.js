// GLOSS Audio Studio — local voices and optional synthesized UI sounds.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STORE = 'gloss_audio_settings_v2';
  const defaults = {voice: '', rate: 0.94, pitch: 1, volume: 0.9, effects: true, effectsVolume: 0.24};
  const settings = {...defaults};
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (stored && typeof stored === 'object') {
      if (typeof stored.voice === 'string') settings.voice = stored.voice;
      for (const key of ['rate','pitch','volume','effectsVolume']) {
        if (typeof stored[key] === 'number' && Number.isFinite(stored[key])) settings[key] = stored[key];
      }
      if (typeof stored.effects === 'boolean') settings.effects = stored.effects;
    }
  } catch (_) {}
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  settings.rate = clamp(settings.rate, 0.7, 1.3);
  settings.pitch = clamp(settings.pitch, 0.7, 1.3);
  settings.volume = clamp(settings.volume, 0, 1);
  settings.effectsVolume = clamp(settings.effectsVolume, 0, 0.5);
  let voices = [];
  let context;
  let lastHandSound = -Infinity;
  let speechToken = 0;
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (_) {}
  }
  function labels() {
    $('rateValue').textContent = settings.rate.toFixed(2) + '×';
    $('pitchValue').textContent = settings.pitch.toFixed(2);
    $('voiceVolumeValue').textContent = Math.round(settings.volume * 100) + '%';
    $('effectVolumeValue').textContent = Math.round(settings.effectsVolume * 200) + '%';
    $('effectsVolume').disabled = !settings.effects;
    $('effectTest').disabled = !settings.effects || !AudioContextClass;
  }
  function updateVoices() {
    const select = $('voiceSelect');
    if (!select) return;
    const old = select.value || settings.voice;
    voices = supported ? window.speechSynthesis.getVoices().filter(v => /^en(?:-|$)/i.test(v.lang)) : [];
    select.replaceChildren();
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'System default voice';
    select.append(auto);
    for (const voice of voices) {
      const option = document.createElement('option');
      option.value = voice.name + '|' + voice.lang;
      option.textContent = voice.name + ' (' + voice.lang + ')' + (voice.localService ? ' · on device' : '');
      select.append(option);
    }
    select.value = voices.some(v => v.name + '|' + v.lang === old) ? old : '';
    settings.voice = select.value;
    $('voiceNote').textContent = supported
      ? voices.length + ' English voice(s) available. These are browser/system voices, not OpenAI cloud voices.'
      : 'Speech synthesis is not available in this browser.';
    $('voiceTest').disabled = !supported;
  }
  function unlock() {
    if (!AudioContextClass || !settings.effects) return;
    try {
      if (!context) context = new AudioContextClass();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch (_) {}
  }
  function tone(start, duration, from, to, amplitude = 1, type = 'sine') {
    if (!context || context.state !== 'running' || !settings.effects) return;
    const t = context.currentTime + start;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(40, from), t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    const peak = Math.max(0.0001, 0.14 * settings.effectsVolume * amplitude);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.035, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function sound(kind) {
    if (!settings.effects || !AudioContextClass) return;
    unlock();
    if (!context || context.state !== 'running') return;
    switch (kind) {
      case 'cameraStart':
        tone(0, .12, 300, 420, .7, 'triangle');
        tone(.095, .16, 420, 670, .85);
        tone(.22, .22, 690, 980, .62);
        break;
      case 'handAcquired':
        if (performance.now() - lastHandSound < 10000) return;
        lastHandSound = performance.now();
        tone(0, .09, 750, 900, .5);
        break;
      case 'gesture':
        tone(0, .15, 630, 820, .74);
        tone(.11, .22, 980, 1200, .72);
        break;
      case 'cameraStop':
        tone(0, .17, 560, 280, .55, 'triangle');
        break;
    }
  }
  function speak(text, callbacks = {}) {
    if (!supported) {
      if (callbacks.onerror) callbacks.onerror();
      return false;
    }
    const token = ++speechToken;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    const voice = voices.find(v => v.name + '|' + v.lang === settings.voice);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.onstart = () => { if (token === speechToken && callbacks.onstart) callbacks.onstart(); };
    utterance.onend = () => { if (token === speechToken && callbacks.onend) callbacks.onend(); };
    utterance.onerror = () => { if (token === speechToken && callbacks.onerror) callbacks.onerror(); };
    synth.speak(utterance);
    return true;
  }
  function stopSpeech() {
    speechToken++;
    if (supported) window.speechSynthesis.cancel();
  }
  function init() {
    if (!$('voiceSelect')) return;
    for (const [id, field] of [['voiceRate','rate'],['voicePitch','pitch'],['voiceVolume','volume'],['effectsVolume','effectsVolume']]) {
      $(id).value = settings[field];
      $(id).addEventListener('input', () => {
        settings[field] = Number($(id).value);
        save();
        labels();
      });
    }
    $('effectsToggle').checked = settings.effects;
    $('effectsToggle').addEventListener('change', () => {
      settings.effects = $('effectsToggle').checked;
      save(); labels();
      if (settings.effects) { unlock(); sound('cameraStart'); }
    });
    $('voiceSelect').addEventListener('change', () => {
      settings.voice = $('voiceSelect').value;
      save();
    });
    $('voiceTest').addEventListener('click', () => {
      speak('GLOSS online. Gesture recognized. Hello, how are you today?');
    });
    $('effectTest').addEventListener('click', () => { unlock(); sound('cameraStart'); setTimeout(() => sound('gesture'), 500); });
    labels(); updateVoices();
    if (supported) {
      if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
      setTimeout(updateVoices, 500);
    }
    if (!AudioContextClass) {
      $('effectsToggle').disabled = true;
      $('effectTest').disabled = true;
    }
  }
  window.GlossAudio = {speak, sound, unlock, stopSpeech};
  init();
})();
