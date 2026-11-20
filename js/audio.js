/*
 * Audio helpers
 *  - TQAudio.tts: Browser Speech Synthesis player for listening scripts (no audio files needed)
 *  - TQAudio.Recorder: microphone recording (MediaRecorder) + optional speech-to-text (SpeechRecognition)
 */
(function (root) {
  'use strict';
  const synth = root.speechSynthesis || null;
  const FEMALE = /(female|samantha|zira|karen|moira|tessa|victoria|susan|aria|jenny|libby|sonia|natasha|serena|allison|ava|joanna|kendra|salli|emma|hazel|catherine|fiona)/i;
  const MALE = /(male|daniel|alex|david|mark|guy|fred|ryan|george|james|thomas|christopher|eric|matthew|brian|oliver|aaron|arthur|rishi)/i;

  function englishVoices() {
    if (!synth) return [];
    return synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang) || /english/i.test(v.name));
  }

  /** Pick voice + pitch per speaker: N = narrator, W = woman, M = man */
  function voiceFor(sp) {
    const list = englishVoices();
    const us = list.filter((v) => /en[-_]US/i.test(v.lang));
    const pool = us.length ? us : list;
    const female = pool.find((v) => FEMALE.test(v.name)) || list.find((v) => FEMALE.test(v.name));
    const male = pool.find((v) => MALE.test(v.name) && !/female/i.test(v.name)) || list.find((v) => MALE.test(v.name) && !/female/i.test(v.name));
    const any = pool[0] || null;
    if (sp === 'W') return { voice: female || any, pitch: female ? 1 : 1.2 };
    if (sp === 'M') return { voice: male || (female ? pool.find((v) => v !== female) : null) || any, pitch: male ? 1 : 0.8 };
    return { voice: any || female || male || null, pitch: 1 };
  }

  /** Split long lines into sentences so Chrome never cuts off a long utterance. */
  function chunks(text) {
    const parts = String(text).split(/(?<=[.!?])\s+/);
    const out = [];
    for (const p of parts) {
      const prev = out[out.length - 1];
      // keep "A. She is...", "Ms. Park", "8 a.m. to noon" together
      if (prev && /(^|\s)([A-D]|Mr|Ms|Mrs|Dr|a\.m|p\.m|ext|etc)\.$/i.test(prev)) out[out.length - 1] = prev + ' ' + p;
      else if (p.trim()) out.push(p.trim());
    }
    return out.length ? out : [String(text)];
  }

  let token = 0;
  const tts = {
    supported: !!(synth && root.SpeechSynthesisUtterance),
    playing: false,
    /**
     * lines: [{sp, text}] ; opts: { rate, onLine(i, n), onEnd(completed) }
     */
    play(lines, opts) {
      opts = opts || {};
      if (!this.supported) { opts.onEnd && opts.onEnd(false); return false; }
      this.stop(true);
      const my = ++token;
      const queue = [];
      lines.forEach((l, li) => chunks(l.text).forEach((c) => queue.push({ li, sp: l.sp || 'N', text: c })));
      this.playing = true;
      let i = 0;
      const next = () => {
        if (my !== token) return;
        if (i >= queue.length) { this.playing = false; opts.onEnd && opts.onEnd(true); return; }
        const item = queue[i++];
        const u = new root.SpeechSynthesisUtterance(item.text);
        const vp = voiceFor(item.sp);
        if (vp.voice) u.voice = vp.voice;
        u.lang = (vp.voice && vp.voice.lang) || 'en-US';
        u.pitch = vp.pitch;
        u.rate = Number(opts.rate) || 1;
        opts.onLine && opts.onLine(item.li, lines.length, item);
        let done = false;
        const finish = () => { if (done) return; done = true; setTimeout(next, item.li !== (queue[i] && queue[i].li) ? 350 : 60); };
        u.onend = finish;
        u.onerror = finish;
        synth.speak(u);
      };
      next();
      return true;
    },
    stop(silent) {
      token++;
      const was = this.playing;
      this.playing = false;
      if (synth) synth.cancel();
      return was && !silent;
    },
    say(text, rate) { return this.play([{ sp: 'N', text }], { rate }); },
  };
  if (synth && typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', () => {});

  // ------------------------------------------------------------------ microphone recorder
  const SR = root.SpeechRecognition || root.webkitSpeechRecognition || null;
  const hasMedia = !!(root.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && root.MediaRecorder);

  class Recorder {
    constructor(onUpdate) {
      this.onUpdate = onUpdate || (() => {});
      this.state = 'idle'; // idle | starting | recording | stopped | error
      this.url = null; this.durationSec = 0; this.transcript = ''; this.interim = ''; this.error = '';
      this.recognizedWords = 0;
    }
    static get supported() { return hasMedia; }
    static get speechToText() { return !!SR; }
    async start() {
      if (!hasMedia) { this.state = 'error'; this.error = 'เบราว์เซอร์นี้ไม่รองรับการอัดเสียง'; this.onUpdate(this); return false; }
      this.state = 'starting'; this.onUpdate(this);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        this.state = 'error';
        this.error = 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน (ตรวจสอบสิทธิ์ไมโครโฟนของเบราว์เซอร์ หรือเปิดผ่าน https / localhost)';
        this.onUpdate(this); return false;
      }
      this.chunks = [];
      this.mr = new MediaRecorder(this.stream);
      this.mr.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.mr.onstop = () => {
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = this.chunks.length ? URL.createObjectURL(new Blob(this.chunks, { type: this.mr.mimeType || 'audio/webm' })) : null;
        this.stream.getTracks().forEach((t) => t.stop());
        this.state = 'stopped'; this.onUpdate(this);
      };
      this.transcript = ''; this.interim = ''; this.recognizedWords = 0;
      if (SR) {
        try {
          const rec = new SR();
          rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
          rec.onresult = (ev) => {
            let fin = '', inter = '';
            for (let i = 0; i < ev.results.length; i++) {
              const r = ev.results[i];
              if (r.isFinal) fin += r[0].transcript + ' '; else inter += r[0].transcript;
            }
            this.transcript = fin.trim(); this.interim = inter;
            this.recognizedWords = (this.transcript.match(/[A-Za-z']+|\d+/g) || []).length;
            this.onUpdate(this);
          };
          rec.onerror = () => {};
          rec.onend = () => { if (this.state === 'recording') { try { rec.start(); } catch (e) { /* ignore */ } } };
          rec.start();
          this.rec = rec;
        } catch (e) { this.rec = null; }
      }
      this.t0 = Date.now();
      this.mr.start();
      this.state = 'recording';
      this.tick = setInterval(() => { this.durationSec = (Date.now() - this.t0) / 1000; this.onUpdate(this); }, 500);
      this.onUpdate(this);
      return true;
    }
    stop() {
      if (this.state !== 'recording') return;
      clearInterval(this.tick);
      this.durationSec = (Date.now() - this.t0) / 1000;
      this.state = 'stopping';
      if (this.rec) { const r = this.rec; this.rec = null; try { r.stop(); } catch (e) { /* ignore */ } }
      try { this.mr.stop(); } catch (e) { this.state = 'stopped'; this.onUpdate(this); }
    }
    dispose() {
      clearInterval(this.tick);
      if (this.rec) { try { this.rec.abort(); } catch (e) { /* ignore */ } this.rec = null; }
      if (this.mr && this.mr.state === 'recording') { try { this.mr.stop(); } catch (e) { /* ignore */ } }
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    }
  }

  root.TQAudio = { tts, Recorder };
}(typeof self !== 'undefined' ? self : this));
