/*
 * TOEIC Foundation — pure exam logic (no DOM).
 * Loaded in the browser as a classic script (window.TQExam) and in Node via require() for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TQExam = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LETTERS = ['A', 'B', 'C', 'D'];
  const SKILLS = ['listening', 'reading', 'speaking'];
  const PASS_SPEAKING = 60; // speaking activity counts as "passed" (green) at 60/100

  // ------------------------------------------------------------------ session
  function newAttemptId() {
    return 'A' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function createSession(bank, name) {
    return {
      attemptId: newAttemptId(),
      name: name || '',
      ids: bank.questions.map((q) => q.id),
      answers: {},      // id -> { choice, correct, at }
      speaking: {},     // id -> { text, eval, at, voice }
      drafts: {},       // id -> unsent speaking text
      transcripts: {},  // id -> true when the learner opened the transcript
      marked: [],
      current: 0,
      startedAt: Date.now(),
      elapsedMs: 0,
      finished: false,
      finishedAt: null,
      view: 'exam',
    };
  }

  function isDone(session, id) {
    return !!(session.answers[id] || session.speaking[id]);
  }

  /** Lock an answer. Returns null when the item is already answered or the exam is finished (no re-scoring). */
  function recordAnswer(session, q, choice) {
    if (session.finished || isDone(session, q.id)) return null;
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return null;
    const rec = { choice, correct: choice === q.answer, at: Date.now() };
    session.answers[q.id] = rec;
    return rec;
  }

  /** Lock a speaking response together with its evaluation. Returns null if already submitted. */
  function recordSpeaking(session, q, text, opts) {
    if (session.finished || isDone(session, q.id)) return null;
    const ev = evaluateSpeaking(text, q, opts || {});
    const rec = { text: String(text || ''), eval: ev, at: Date.now(), voice: !!(opts && opts.durationSec) };
    session.speaking[q.id] = rec;
    delete session.drafts[q.id];
    return rec;
  }

  /** 'correct' | 'incorrect' | 'unanswered' — speaking counts as correct when score >= PASS_SPEAKING */
  function statusOf(session, q) {
    if (q.skill === 'speaking') {
      const s = session.speaking[q.id];
      if (!s) return 'unanswered';
      return s.eval.score >= PASS_SPEAKING ? 'correct' : 'incorrect';
    }
    const a = session.answers[q.id];
    if (!a) return 'unanswered';
    return a.correct ? 'correct' : 'incorrect';
  }

  function answeredCount(session) {
    return session.ids.filter((id) => isDone(session, id)).length;
  }

  // ------------------------------------------------------------------ speaking evaluation
  const GRAMMAR_RULES = [
    { re: /\bi(?: am|'m)(?: not)? agree\b/g, fix: 'I agree / I don\'t agree', th: 'agree เป็นกริยาแท้ ไม่ต้องมี am' },
    { re: /(?<!\b(?:does|did|do|can|could|will|would|should|must|may|might|to|let|make|makes|made|help|helps|see|watch|hear|n't|not)\s)\b(he|she|it)\s+(go|have|do|work|want|like|need|make|take|say|come|know|think|look|use|find|give|tell|become|show|try|leave|call|keep|start|seem|help|play|move|live|bring|provide|include|send|finish|get)\b/g,
      fix: 'he/she/it + กริยาเติม -s (he works, she has, it takes)', th: 'ประธานเอกพจน์บุรุษที่ 3 ใน Present Simple ต้องเติม -s/-es' },
    { re: /\bdiscuss about\b/g, fix: 'discuss (the plan)', th: 'discuss ไม่ต้องตามด้วย about' },
    { re: /\bexplain me\b/g, fix: 'explain (it) to me', th: 'explain something to someone' },
    { re: /\b(informations|advices|equipments|furnitures|feedbacks|softwares|homeworks|knowledges)\b/g, fix: 'information / advice / equipment / feedback / software', th: 'คำนามนับไม่ได้ ไม่เติม -s' },
    { re: /\bmore (better|worse|easier|faster|cheaper|bigger|higher|lower|smaller|larger)\b/g, fix: 'better / easier / faster (ไม่ต้องมี more)', th: 'คำที่เป็นขั้นกว่าแล้ว (-er) ไม่ต้องใช้ more ซ้ำ' },
    { re: /\b(can|could|will|would|should|must|may|might) to [a-z]+/g, fix: 'can + V1 (can send, should check)', th: 'Modal verb ตามด้วยกริยารูปเดิม ไม่ต้องมี to' },
    { re: /\b(will|would|should|must|may|might) can\b/g, fix: 'will be able to + V1', th: 'ใช้ modal สองตัวติดกันไม่ได้ ให้ใช้ be able to' },
    { re: /\b(?:didn't|did not) (went|saw|had|made|took|came|gave|got|was|bought|ate|wrote|spoke|met|sent|visited|watched|played|stayed)\b/g, fix: 'didn\'t + V1 (didn\'t go, didn\'t see)', th: 'หลัง did / didn\'t ใช้กริยารูปเดิม' },
    { re: /\bi am (work|study|live|come|go|like|want|need|have|agree|think)\b/g, fix: 'I work / I am working', th: 'ไม่ใช้ am คู่กับกริยารูปเดิม' },
    { re: /\bvery (like|love|enjoy)\b/g, fix: 'really like / like ... very much', th: 'very ขยายกริยาโดยตรงไม่ได้' },
    { re: /\bpeople (is|was|has)\b/g, fix: 'people are / were / have', th: 'people เป็นพหูพจน์' },
    { re: /\b(i|we|they|you) has\b/g, fix: 'I / we / they / you have', th: 'has ใช้กับ he / she / it เท่านั้น' },
    { re: /\b(he|she|it) (are|were)\b/g, fix: 'he / she / it is (was)', th: 'ประธานเอกพจน์ใช้ is / was' },
    { re: /\bin (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, fix: 'on Monday', th: 'วันในสัปดาห์ใช้ on' },
    { re: /\bthere (have|has) (a|an|some|many|two|three|\d+)\b/g, fix: 'there is / there are', th: 'บอกว่า "มี" ใช้ There is / There are' },
    { re: /\bwaiting (the|my|your|his|her|their|our)\b/g, fix: 'waiting for the ...', th: 'wait ต้องตามด้วย for' },
    { re: /\bresponsible to\b/g, fix: 'responsible for', th: 'รับผิดชอบสิ่งใดใช้ responsible for' },
    { re: /\blook(?:ing|s)? forward to (meet|see|work|hear|talk|join)\b/g, fix: 'look forward to + V-ing (meeting, working)', th: 'to ใน look forward to เป็นบุพบท ต้องตามด้วย V-ing' },
    { re: /\bhow about (launch|use|move|start|make|try|add|go|meet|test|send|change|reduce|cut|delay|postpone|do|keep)\b/g, fix: 'How about + V-ing (How about testing...?)', th: 'How about ตามด้วย V-ing' },
    { re: /\b(was|were|is|are) (increase|decrease|drop|rise|improve|grow)\b/g, fix: 'increased / dropped (ไม่ต้องมี was)', th: 'กริยาแท้ไม่ต้องมี verb to be นำหน้า' },
    { re: /\bsince (\d+|one|two|three|four|five|six|seven|eight|nine|ten) (years|months|weeks|days|hours)\b/g, fix: 'for three years', th: 'ช่วงเวลาใช้ for ส่วน since ใช้กับจุดเวลา' },
    { re: /\bbeside of\b/g, fix: 'beside / next to', th: 'beside ไม่ต้องมี of' },
  ];
  const CONNECTORS = ['because', 'so', 'and', 'but', 'also', 'however', 'first', 'second', 'then', 'next', 'finally',
    'for example', 'which', 'that', 'when', 'if', 'while', 'as a result', 'in addition', 'overall', 'after', 'before', 'instead', 'on the other hand'];
  const NATURAL = ['please', 'thank', 'would', 'could', 'sure', 'of course', 'nice', 'great', 'happy to', 'sorry', 'appreciate', 'let\'s',
    '\'m', '\'re', '\'ll', '\'s', 'n\'t', '\'d'];
  const FILLERS = /\b(um+|uh+|er+|erm|hmm+)\b/g;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const norm = (t) => String(t || '').replace(/[’‘`]/g, '\'').replace(/[“”]/g, '"');
  const hasPhrase = (lower, p) => new RegExp('(^|[^a-z])' + p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])').test(lower);

  function countSentences(text) {
    return text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).filter(Boolean).length >= 2).length;
  }

  function levelOf(score) {
    if (score >= 85) return { key: 'excellent', en: 'Excellent', th: 'ดีมาก' };
    if (score >= 70) return { key: 'good', en: 'Good', th: 'ดี' };
    if (score >= PASS_SPEAKING) return { key: 'fair', en: 'Fair', th: 'ผ่าน แต่ควรเสริม' };
    return { key: 'practice', en: 'Needs practice', th: 'ควรฝึกเพิ่ม' };
  }

  /**
   * Rule-based speaking feedback. Not a human rater: it checks common grammar errors of Thai learners,
   * task completion (required elements), vocabulary range, sentence structure and — when audio was
   * recorded — fluency from speaking time and words per minute.
   * opts: { durationSec, spokenWords }  (spokenWords = words recognised from the microphone)
   */
  function evaluateSpeaking(text, q, opts) {
    opts = opts || {};
    const raw = norm(text).trim();
    const lower = raw.toLowerCase();
    const words = lower.match(/[a-z]+(?:'[a-z]+)?|\d+(?:\.\d+)?%?/g) || [];
    const wc = words.length;
    const sentences = countSentences(raw);
    const minWords = q.minWords || 25;
    const minSent = q.minSentences || 3;

    // grammar
    const issues = [];
    for (const rule of GRAMMAR_RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(lower)) !== null) {
        issues.push({ found: raw.substr(m.index, m[0].length), fix: rule.fix, th: rule.th });
        if (issues.length > 12) break;
      }
    }
    if (/(^|[\s,.!?"(])i(?=[\s',.!?]|$)/.test(raw)) issues.push({ found: 'i', fix: 'I', th: 'สรรพนาม I เขียนตัวพิมพ์ใหญ่เสมอ' });
    const tips = [];
    if (raw && /^[a-z]/.test(raw)) tips.push('ขึ้นต้นประโยคด้วยตัวพิมพ์ใหญ่ เช่น "Hello, ..." แทน "hello, ..."');
    if (raw && !/[.!?]$/.test(raw)) tips.push('จบประโยคด้วยเครื่องหมาย . ? หรือ ! เพื่อให้อ่าน/ประเมินโครงสร้างได้ชัดเจน');
    let grammar = wc < 5 ? 0 : clamp(100 - issues.length * 20 - (tips.length ? 5 : 0), 0, 100);

    // vocabulary
    const kw = (q.keywords || []).filter((k) => hasPhrase(lower, k));
    const content = words.filter((w) => w.length >= 4);
    const uniq = new Set(content).size;
    const ratio = content.length ? uniq / content.length : 0;
    let vocabulary = Math.round(
      Math.min(1, kw.length / 3) * 55 +
      clamp((ratio - 0.4) / 0.3, 0, 1) * 25 +
      Math.min(1, wc / minWords) * 20);

    // sentence structure
    const conn = CONNECTORS.filter((c) => hasPhrase(lower, c));
    const avgLen = sentences ? wc / sentences : wc;
    const avgPart = avgLen >= 6 && avgLen <= 22 ? 30 : (avgLen >= 4 && avgLen <= 30 ? 18 : 6);
    let structure = Math.round(Math.min(1, sentences / minSent) * 40 + (wc ? avgPart : 0) + Math.min(1, conn.length / 3) * 30);

    // task completion & natural communication
    const reqHits = (q.required || []).map((r) => {
      const tests = r.patterns.map((p) => new RegExp(p, 'i').test(lower));
      return { label: r.label, en: r.en, ok: r.all ? tests.every(Boolean) : tests.some(Boolean) };
    });
    const reqRatio = reqHits.length ? reqHits.filter((r) => r.ok).length / reqHits.length : 1;
    const naturalHits = NATURAL.filter((n) => lower.includes(n)).length;
    let natural = Math.round(reqRatio * 80 + Math.min(1, naturalHits / 2) * 20);

    // fluency — only when the learner actually spoke
    let fluency = null;
    const dur = Number(opts.durationSec) || 0;
    if (dur >= 3) {
      if (opts.spokenWords) {
        const wpm = opts.spokenWords / (dur / 60);
        let s = wpm >= 90 && wpm <= 160 ? 100 : (wpm >= 60 && wpm <= 190 ? 75 : (wpm >= 35 ? 50 : 30));
        const fillers = (lower.match(FILLERS) || []).length;
        s = clamp(s - fillers * 5, 0, 100);
        fluency = { score: s, wpm: Math.round(wpm), durationSec: Math.round(dur), basis: 'wpm',
          note: `พูด ${Math.round(dur)} วินาที ประมาณ ${Math.round(wpm)} คำ/นาที (เป้าหมายผู้เริ่มต้น 90–160 คำ/นาที)` };
      } else {
        const r = dur / (q.responseSeconds || 45);
        const s = r >= 0.6 ? 75 : (r >= 0.35 ? 55 : 35);
        fluency = { score: s, wpm: null, durationSec: Math.round(dur), basis: 'duration',
          note: `พูด ${Math.round(dur)} วินาที จากเวลาแนะนำ ${q.responseSeconds || 45} วินาที (เบราว์เซอร์นี้แปลงเสียงเป็นข้อความไม่ได้ จึงประเมินจากความยาวการพูด)` };
      }
    }

    // very short answers cannot score well on any criterion
    // answers shorter than the recommended length are capped proportionally
    if (wc < minWords) {
      const cap = Math.round(50 + 40 * (wc / minWords));
      grammar = Math.min(grammar, cap); vocabulary = Math.min(vocabulary, cap);
      structure = Math.min(structure, cap); natural = Math.min(natural, cap);
    }
    const criteria = { grammar, vocabulary, structure, natural };
    if (fluency) criteria.fluency = fluency.score;
    const vals = Object.values(criteria);
    const score = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);

    return {
      score, level: levelOf(score), criteria, fluency, wordCount: wc, sentences, minWords, minSentences: minSent,
      issues, tips, requiredHits: reqHits, keywordsUsed: kw, connectorsUsed: conn,
      keywordsMissing: (q.keywords || []).filter((k) => !kw.includes(k)).slice(0, 6),
    };
  }

  // ------------------------------------------------------------------ analytics
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  function analyze(session, bank) {
    const qs = bank.questions;
    const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
    const res = {
      timeMs: session.elapsedMs || 0,
      answered: answeredCount(session),
      total: qs.length,
      lr: { correct: 0, wrong: 0, unanswered: 0, total: 0, pct: 0 },
      skills: {},
      parts: {},
      knowledge: {},
      speaking: { submitted: 0, passed: 0, total: 0, avg: 0, criteria: {}, voiceCount: 0 },
      wrongIds: [], unansweredIds: [],
    };
    for (const s of SKILLS) res.skills[s] = { correct: 0, wrong: 0, unanswered: 0, total: 0, pct: 0, weight: bank.skills[s].weight };
    for (const k of ['grammar', 'vocabulary', 'listening', 'reading']) res.knowledge[k] = { correct: 0, total: 0, wrongTopics: [], pct: 0 };

    const critSum = {}; const critN = {};
    const speakingIssues = {};
    let spScoreSum = 0;
    for (const id of session.ids) {
      const q = byId[id];
      const st = statusOf(session, q);
      const sk = res.skills[q.skill];
      const part = (res.parts[q.partKey] ||= { label: bank.parts[q.partKey].label, skill: q.skill, correct: 0, total: 0, pct: 0 });
      sk.total++; part.total++;
      if (st === 'correct') { sk.correct++; part.correct++; }
      else if (st === 'incorrect') { sk.wrong++; res.wrongIds.push(id); }
      else { sk.unanswered++; res.unansweredIds.push(id); }

      if (q.skill === 'speaking') {
        res.speaking.total++;
        const sp = session.speaking[id];
        if (sp) {
          res.speaking.submitted++;
          spScoreSum += sp.eval.score;
          if (sp.eval.score >= PASS_SPEAKING) res.speaking.passed++;
          if (sp.voice) res.speaking.voiceCount++;
          for (const [c, v] of Object.entries(sp.eval.criteria)) { critSum[c] = (critSum[c] || 0) + v; critN[c] = (critN[c] || 0) + 1; }
          for (const iss of sp.eval.issues) {
            const key = iss.fix;
            (speakingIssues[key] ||= { fix: iss.fix, th: iss.th, examples: [], count: 0 }).count++;
            if (speakingIssues[key].examples.length < 3) speakingIssues[key].examples.push(iss.found);
          }
        }
      } else {
        res.lr.total++;
        if (st === 'correct') res.lr.correct++; else if (st === 'incorrect') res.lr.wrong++; else res.lr.unanswered++;
        for (const k of q.knowledge) {
          const kn = res.knowledge[k];
          if (!kn) continue;
          kn.total++;
          if (st === 'correct') kn.correct++; else kn.wrongTopics.push({ id, no: q.no, topic: q.topic, status: st });
        }
      }
    }
    // speaking contributes to grammar / vocabulary knowledge through its criteria
    res.lr.pct = pct(res.lr.correct, res.lr.total);
    for (const s of SKILLS) res.skills[s].pct = pct(res.skills[s].correct, res.skills[s].total);
    for (const p of Object.values(res.parts)) p.pct = pct(p.correct, p.total);
    for (const k of Object.values(res.knowledge)) k.pct = pct(k.correct, k.total);
    res.speaking.avg = res.speaking.submitted ? Math.round(spScoreSum / res.speaking.submitted) : 0;
    // speaking skill % = average speaking score over ALL 12 activities (not submitted = 0)
    res.skills.speaking.score = res.speaking.total ? Math.round(spScoreSum / res.speaking.total) : 0;
    for (const c of Object.keys(critSum)) res.speaking.criteria[c] = Math.round(critSum[c] / critN[c]);
    res.speaking.issues = Object.values(speakingIssues).sort((a, b) => b.count - a.count);
    res.recommendations = recommend(res, session, bank, byId);
    return res;
  }

  const SKILL_TH = { listening: 'Listening (การฟัง)', reading: 'Reading (การอ่าน)', speaking: 'Speaking (การพูด)' };
  const SKILL_PLAN = {
    listening: 'ฟังบทสนทนาสั้น ๆ ภาษาอังกฤษธุรกิจวันละ 15 นาที (ฟังรอบแรกไม่ดู transcript รอบสองดู transcript แล้ว shadowing พูดตาม)',
    reading: 'อ่านอีเมล/ประกาศภาษาอังกฤษวันละ 2 ชิ้น จับเวลา และขีดเส้นใต้คำบอกเวลา คำเชื่อม และประธานของประโยค',
    speaking: 'อัดเสียงตอบโจทย์ Speaking วันละ 2 ข้อ ข้อละ 45–60 วินาที แล้วเทียบกับคำตอบตัวอย่าง จด 3 วลีมาใช้ซ้ำ',
  };

  function skillPercent(res, s) { return s === 'speaking' ? res.skills.speaking.score : res.skills[s].pct; }

  function recommend(res, session, bank, byId) {
    const wrongOrSkipped = [...res.wrongIds, ...res.unansweredIds].map((id) => byId[id]);
    const mcqWrong = wrongOrSkipped.filter((q) => q.skill !== 'speaking');
    const spWeak = wrongOrSkipped.filter((q) => q.skill === 'speaking');
    const review = mcqWrong.map((q) => ({ no: q.no, topic: q.topic, part: q.part }))
      .concat(spWeak.map((q) => ({ no: q.no, topic: q.topic, part: q.part })));
    const vocabSeen = new Set();
    const vocab = [];
    for (const q of wrongOrSkipped) {
      for (const c of q.vocab || []) {
        if (vocabSeen.has(c.word)) continue;
        vocabSeen.add(c.word);
        vocab.push({ word: c.word, th: c.th, pos: c.pos, no: q.no });
      }
    }
    const grammar = mcqWrong.filter((q) => q.grammar && (q.knowledge.includes('grammar') || q.skill === 'listening' || q.skill === 'reading'))
      .map((q) => ({ no: q.no, title: q.grammar.title }));
    for (const iss of (res.speaking.issues || []).slice(0, 5)) grammar.push({ no: null, title: `Speaking: ${iss.fix}`, count: iss.count });

    const order = SKILLS.slice().sort((a, b) => skillPercent(res, a) - skillPercent(res, b));
    const weakest = order[0];
    const plan = [
      `ทบทวนข้อที่ผิดหรือยังไม่ได้ทำ ${review.length} ข้อ โดยเปิดคำอธิบายจาก Question Navigator`,
      vocab.length ? `ทำบัตรคำศัพท์ ${Math.min(vocab.length, 10)} คำแรกจากรายการ "คำศัพท์ที่ควรทบทวน" แต่งประโยคงานจริงคำละ 1 ประโยค` : 'ทบทวน Vocabulary Card ของทุกข้อ แล้วแต่งประโยคใหม่ 5 ประโยค',
      SKILL_PLAN[weakest],
      res.skills.speaking.score < 70 ? 'ฝึกพูดซ้ำข้อ Speaking ที่คะแนนต่ำ โดยใช้โครงสร้างจากคำตอบตัวอย่าง แต่เปลี่ยนเนื้อหาเป็นงานของตัวเอง' : 'รักษาการฝึกพูด: เลือก Speaking 2 ข้อ แล้วพูดให้ยาวขึ้นและใส่ตัวอย่างจริงเพิ่ม',
      'ทำแบบทดสอบชุดนี้อีกครั้งในอีก 2–3 วัน (ปุ่ม "เริ่มทำชุดใหม่") แล้วเทียบผลในประวัติการสอบ',
    ];
    return {
      review, vocab: vocab.slice(0, 16), grammar,
      weakest, skillOrder: order,
      focus: `${SKILL_TH[weakest]} มีเปอร์เซ็นต์ต่ำที่สุด (${skillPercent(res, weakest)}%) ควรเพิ่มเวลาฝึกทักษะนี้ก่อน`,
      plan,
    };
  }

  // ------------------------------------------------------------------ utils
  function formatDuration(ms) {
    if (!ms || ms < 0) return '0 วินาที';
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h} ชม. ${m} นาที` : m ? `${m} นาที ${sec} วินาที` : `${sec} วินาที`;
  }
  function clock(ms) {
    const s = Math.floor((ms || 0) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return (h ? h + ':' : '') + pad(m) + ':' + pad(sec);
  }

  /** History entry (one per attempt id — finishing twice never adds a second record). */
  function upsertHistory(history, session, res) {
    const list = Array.isArray(history) ? history.slice() : [];
    const entry = {
      attemptId: session.attemptId, name: session.name, finishedAt: session.finishedAt || Date.now(), timeMs: res.timeMs,
      lr: { correct: res.lr.correct, total: res.lr.total, pct: res.lr.pct },
      listening: res.skills.listening.pct, reading: res.skills.reading.pct, speaking: res.skills.speaking.score,
      speakingPassed: res.speaking.passed,
    };
    const i = list.findIndex((h) => h.attemptId === session.attemptId);
    if (i >= 0) return { list, added: false };
    list.unshift(entry);
    return { list: list.slice(0, 20), added: true };
  }

  // ------------------------------------------------------------------ validation
  function validateBank(bank) {
    const errs = [];
    const seen = new Set();
    for (const q of bank.questions || []) {
      if (seen.has(q.id)) errs.push(`${q.id}: duplicate id`);
      seen.add(q.id);
      if (!SKILLS.includes(q.skill)) errs.push(`${q.id}: bad skill`);
      if (!bank.parts?.[q.partKey] || bank.parts[q.partKey].skill !== q.skill) errs.push(`${q.id}: bad partKey`);
      if (!bank.difficulties?.[q.difficulty]) errs.push(`${q.id}: bad difficulty`);
      for (const f of ['topic', 'strategy', 'learned']) if (!q[f]) errs.push(`${q.id}: missing ${f}`);
      if (!Array.isArray(q.vocab) || !q.vocab.length) errs.push(`${q.id}: needs vocab cards`);
      else q.vocab.forEach((c, i) => {
        for (const f of ['word', 'th', 'pos', 'ipa', 'example']) if (!c[f]) errs.push(`${q.id}: vocab ${i} missing ${f}`);
        if (!/^\/.+\/$/.test(c.ipa || '')) errs.push(`${q.id}: vocab ${i} IPA must be /.../`);
        if (!Array.isArray(c.collocations) || c.collocations.length < 2) errs.push(`${q.id}: vocab ${i} needs collocations`);
      });
      if (q.skill === 'speaking') {
        if (!q.prompt || !q.sample || !q.situation) errs.push(`${q.id}: speaking text missing`);
        if (!Array.isArray(q.required) || q.required.length < 3) errs.push(`${q.id}: needs >=3 required elements`);
        else q.required.forEach((r, i) => r.patterns.forEach((p) => { try { new RegExp(p, 'i'); } catch (e) { errs.push(`${q.id}: required ${i} bad regex`); } }));
        if (!q.responseSeconds || !q.minWords) errs.push(`${q.id}: timing missing`);
      } else {
        const n = q.partKey === 'p2' ? 3 : 4;
        if (!Array.isArray(q.choices) || q.choices.length !== n) errs.push(`${q.id}: needs ${n} choices`);
        else if (new Set(q.choices).size !== n) errs.push(`${q.id}: duplicate choices`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= n) errs.push(`${q.id}: bad answer index`);
        if (!Array.isArray(q.choiceNotes) || q.choiceNotes.length !== n) errs.push(`${q.id}: choiceNotes must match choices`);
        else q.choiceNotes.forEach((t, i) => {
          const want = i === q.answer ? /^ถูก/ : /^ผิด/;
          if (!want.test(t || '')) errs.push(`${q.id}: choiceNote ${i} must start with ${i === q.answer ? 'ถูก' : 'ผิด'}`);
        });
        for (const f of ['why', 'trap', 'question']) if (!q[f]) errs.push(`${q.id}: missing ${f}`);
        if (!q.grammar || !q.grammar.title || !q.grammar.examples?.length) errs.push(`${q.id}: grammar point missing`);
        if (!Array.isArray(q.workplace) || !q.workplace.length) errs.push(`${q.id}: workplace examples missing`);
        if (q.skill === 'listening' && !(q.audio?.lines?.length)) errs.push(`${q.id}: listening needs audio lines`);
        if (q.partKey === 'p1' && !q.image) errs.push(`${q.id}: photograph needs an image`);
        if ((q.partKey === 'p6' || q.partKey === 'p7') && !q.passage?.text) errs.push(`${q.id}: passage missing`);
      }
    }
    return errs;
  }

  return {
    LETTERS, SKILLS, PASS_SPEAKING, GRAMMAR_RULES,
    createSession, recordAnswer, recordSpeaking, statusOf, answeredCount, isDone,
    evaluateSpeaking, levelOf, analyze, upsertHistory, formatDuration, clock, validateBank,
  };
}));
