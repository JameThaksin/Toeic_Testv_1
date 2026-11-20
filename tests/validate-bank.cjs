/*
 * ตรวจคลังข้อสอบ data/questions.json และ logic การให้คะแนนแบบไม่ต้องเปิดเบราว์เซอร์
 * รัน:  node tests/validate-bank.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'js', 'exam.js'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};
const thai = (t) => /[฀-๿]/.test(t || '');
const latin = (t) => /[A-Za-z]{3,}/.test(t || '');

const raw = fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8');
const bank = JSON.parse(raw);
const qs = bank.questions;
const by = (f) => qs.filter(f);
const mcq = by((q) => q.skill !== 'speaking');
const sp = by((q) => q.skill === 'speaking');

check('มีข้อสอบ 30 ข้อ', qs.length === 30, qs.length);
check('Speaking 12 / Reading 9 / Listening 9', sp.length === 12 && by((q) => q.skill === 'reading').length === 9 && by((q) => q.skill === 'listening').length === 9,
  `${sp.length}/${by((q) => q.skill === 'reading').length}/${by((q) => q.skill === 'listening').length}`);
check('สัดส่วนน้ำหนัก 40% / 30% / 30%', bank.skills.speaking.weight === 40 && bank.skills.reading.weight === 30 && bank.skills.listening.weight === 30);
const partCount = (k) => by((q) => q.partKey === k).length;
check('Listening: Photographs 2 / Question-Response 3 / Conversations 2 / Short Talks 2',
  partCount('p1') === 2 && partCount('p2') === 3 && partCount('p3') === 2 && partCount('p4') === 2);
check('Reading: Grammar & Incomplete Sentences 4 / Text Completion 2 / Reading Comprehension 3',
  partCount('p5') === 4 && partCount('p6') === 2 && partCount('p7') === 3);
check('Speaking: 6 หมวด หมวดละ 2 ข้อ', ['s1', 's2', 's3', 's4', 's5', 's6'].every((k) => partCount(k) === 2));
check('จำนวนข้อในแต่ละพาร์ตตรงกับ metadata', Object.entries(bank.parts).every(([k, p]) => partCount(k) === p.count));
check('เลขข้อ 1–30 เรียงต่อเนื่อง', qs.every((q, i) => q.no === i + 1));

const problems = E.validateBank(bank);
check('โครงสร้างทุกข้อถูกต้อง (ตัวเลือก, เฉลย, คำอธิบาย, Vocabulary Card, IPA, collocations, regex ของ Speaking)', problems.length === 0, problems.join('; '));

check('ทุกข้อ MCQ มีคำตอบถูกเพียงข้อเดียว (choiceNotes ขึ้นต้น "ถูก" เพียงตัวเดียว)',
  mcq.every((q) => q.choiceNotes.filter((n) => /^ถูก/.test(n)).length === 1 && /^ถูก/.test(q.choiceNotes[q.answer])));
check('อธิบายเหตุผลครบทุกตัวเลือก (ภาษาไทย ยาวพอ)', mcq.every((q) => q.choiceNotes.every((n) => thai(n) && n.length > 25)));
check('ตัวเลือกไม่ซ้ำกันในแต่ละข้อ', mcq.every((q) => new Set(q.choices.map((c) => c.toLowerCase())).size === q.choices.length));
check('คำอธิบายเป็นภาษาไทยและมีตัวอย่างภาษาอังกฤษประกอบ', qs.every((q) => thai(q.why || q.sampleNotes) && latin(q.why || q.sample)));
check('ทุกข้อ MCQ มี 10 ส่วนของ feedback (why, trap, grammar, vocab, workplace, strategy, learned)',
  mcq.every((q) => q.why && q.trap && q.grammar && q.vocab.length && q.workplace.length && q.strategy && q.learned));
check('Grammar Point มีตัวอย่างภาษาอังกฤษ', mcq.every((q) => q.grammar.examples.every(latin)));
check('Real Workplace Application มีทั้งอังกฤษและคำแปลไทย', mcq.every((q) => q.workplace.every((w) => latin(w.en) && thai(w.th))));
const vc = qs.flatMap((q) => q.vocab);
check('Vocabulary Card ครบ: คำ, คำแปลไทย, Part of Speech, IPA, ตัวอย่าง, collocations ≥ 2',
  vc.every((v) => v.word && thai(v.th) && v.pos && /^\/.+\/$/.test(v.ipa) && latin(v.example) && v.collocations.length >= 2), `${vc.length} cards`);
check('มีบัตรคำ postpone ตามตัวอย่างในโจทย์ (postpone a meeting / deadline / project)',
  vc.some((v) => v.word === 'postpone' && ['postpone a meeting', 'postpone a deadline', 'postpone a project'].every((c) => v.collocations.includes(c))));

const dist = [0, 0, 0, 0];
mcq.forEach((q) => dist[q.answer]++);
check('เฉลย A/B/C/D กระจาย ไม่เดาได้จากตำแหน่ง (แต่ละตำแหน่ง ≤ 6 ข้อ)', dist.every((n) => n <= 6) && dist.filter((n) => n > 0).length === 4, dist.join('/'));
check('ตัวเลือกที่ถูกไม่ใช่ตัวที่ยาวที่สุดเสมอ', mcq.filter((q) => q.choices[q.answer].length === Math.max(...q.choices.map((c) => c.length))).length <= mcq.length / 2,
  `${mcq.filter((q) => q.choices[q.answer].length === Math.max(...q.choices.map((c) => c.length))).length}/${mcq.length}`);

check('Listening ทุกข้อมีบทเสียง (Speech Synthesis) และ Transcript', by((q) => q.skill === 'listening').every((q) => q.audio.lines.length && q.audio.lines.every((l) => latin(l.text))));
check('Part 1 / 2: ตัวเลือกอยู่ในเสียงครบทุกตัว (ซ่อนข้อความก่อนตอบ)',
  by((q) => q.partKey === 'p1' || q.partKey === 'p2').every((q) => q.hideChoices && q.choices.every((c) => q.audio.lines.some((l) => l.text.includes(c)))));
global.self = {};
require(path.join(ROOT, 'js', 'illustrations.js'));
const ILL = global.self.TQIllustrations;
check('Part 1 ทุกข้อมีภาพประกอบ SVG เฉพาะข้อ (ไม่ใช่คำบรรยาย)', by((q) => q.partKey === 'p1').every((q) => ILL[q.image] && ILL[q.image].includes('<svg'))
  && new Set(by((q) => q.partKey === 'p1').map((q) => q.image)).size === 2);
check('Part 3 / 4: แสดงคำถาม + คำแปลไทย ส่วนบทสนทนาอยู่ในเสียง', by((q) => q.partKey === 'p3' || q.partKey === 'p4').every((q) => latin(q.question) && thai(q.questionTh)));
check('Part 6 / 7 มีบทความ (email / notice / advertisement)', by((q) => ['p6', 'p7'].includes(q.partKey)).every((q) => q.passage.text.length > 150)
  && ['Business Email', 'Notice', 'Advertisement', 'Workplace Notice'].every((k) => qs.some((q) => q.passage && q.passage.kind === k)));
check('Part 6 ช่องว่างในบทความตรงกับคำถาม', by((q) => q.partKey === 'p6').every((q) => /___\(\d\)___/.test(q.passage.text)));
check('ความยากค่อย ๆ เพิ่ม: ในแต่ละพาร์ตไม่มีข้อที่ง่ายลง, แต่ละทักษะเริ่มที่ง่ายและจบที่ท้าทาย', (() => {
  const order = { easy: 0, medium: 1, hard: 2 };
  const partsOk = Object.keys(bank.parts).every((k) => { const d = by((q) => q.partKey === k).map((q) => order[q.difficulty]); return d.every((x, i) => i === 0 || x >= d[i - 1]); });
  const skillsOk = ['listening', 'reading', 'speaking'].every((s) => { const l = by((q) => q.skill === s); return l[0].difficulty === 'easy' && l[l.length - 1].difficulty === 'hard'; });
  return partsOk && skillsOk;
})());
const topics = ['Parts of Speech', 'Subject-Verb Agreement', 'Pronouns', 'Tenses', 'Vocabulary', 'Conjunctive'];
check('Reading ครอบคลุม Parts of Speech, SVA, Pronouns, Tenses, Vocabulary, Conjunctions', topics.every((t) => by((q) => q.skill === 'reading').some((q) => q.topic.includes(t))));

// speaking evaluation
const sampleScores = sp.map((q) => E.evaluateSpeaking(q.sample, q, {}).score);
check('คำตอบตัวอย่าง Speaking ทุกข้อได้ ≥ 85 และทำครบทุก Task', sp.every((q) => {
  const ev = E.evaluateSpeaking(q.sample, q, {});
  return ev.score >= 85 && ev.requiredHits.every((r) => r.ok) && ev.issues.length === 0;
}), sampleScores.join(','));
check('Speaking ทุกข้อมีคำตอบตัวอย่าง วลีที่มีประโยชน์ และข้อผิดพลาดที่พบบ่อย', sp.every((q) => latin(q.sample) && q.usefulPhrases.length >= 3 && q.commonMistakes.length >= 2));
const S1 = sp[0];
const weak = E.evaluateSpeaking('Hi, I am work as a developer. My name is Ploy. i very like my job.', S1, {});
check('คำตอบสั้นและผิดไวยากรณ์ได้ต่ำกว่าเกณฑ์ผ่าน และจับข้อผิดได้ (am work, very like, i)',
  weak.score < E.PASS_SPEAKING && ['I work', 'really like', 'I'].every((f) => weak.issues.some((i) => i.fix.startsWith(f))), `${weak.score}`);
const fp = E.evaluateSpeaking('Does he go to the office every day? She can go. It takes ten minutes. He works hard.', S1, {});
check('ตัวตรวจ Grammar ไม่จับผิดประโยคที่ถูก (does he go / can go / it takes)', fp.issues.length === 0, fp.issues.map((i) => i.found).join('|'));
check('Common mistakes ของแต่ละข้อถูกตัวตรวจ Grammar จับได้อย่างน้อย 1 ข้อต่อ activity',
  sp.filter((q) => q.commonMistakes.some((m) => E.evaluateSpeaking(m.wrong, q, {}).issues.length > 0)).length >= 10,
  `${sp.filter((q) => q.commonMistakes.some((m) => E.evaluateSpeaking(m.wrong, q, {}).issues.length > 0)).length}/12`);
check('Fluency ประเมินเฉพาะเมื่อมีเสียง', E.evaluateSpeaking(S1.sample, S1, {}).fluency === null
  && E.evaluateSpeaking(S1.sample, S1, { durationSec: 30, spokenWords: 55 }).criteria.fluency === 100);

// session & analytics
const s = E.createSession(bank, 'Test');
const first = E.recordAnswer(s, qs[0], qs[0].answer);
const again = E.recordAnswer(s, qs[0], (qs[0].answer + 1) % 4);
check('ล็อกคำตอบ: ตอบซ้ำไม่ได้ และไม่นับคะแนนซ้ำ', first && first.correct && again === null && s.answers[qs[0].id].choice === qs[0].answer);
E.recordAnswer(s, qs[1], (qs[1].answer + 1) % 4);
E.recordSpeaking(s, S1, S1.sample, {});
check('ส่ง Speaking ซ้ำไม่ได้', E.recordSpeaking(s, S1, 'short', {}) === null);
const res = E.analyze(s, bank);
check('Analytics: L&R แยกจาก Speaking (ถูก 1 ผิด 1 จาก 18 ข้อ)', res.lr.correct === 1 && res.lr.wrong === 1 && res.lr.total === 18 && res.lr.unanswered === 16);
check('Analytics: Speaking คิดจาก 12 กิจกรรม ไม่ปนกับ L&R', res.speaking.total === 12 && res.speaking.submitted === 1 && res.skills.speaking.score === Math.round(res.speaking.avg / 12));
check('ไม่มีการแปลงเป็นคะแนน 990 ในผลวิเคราะห์', !JSON.stringify(res).includes('990'));
check('มีคำแนะนำครบ 5 ด้าน', ['review', 'vocab', 'grammar', 'focus', 'plan'].every((k) => res.recommendations[k] && (res.recommendations[k].length || typeof res.recommendations[k] === 'string')));
s.finished = true; s.finishedAt = Date.now();
const h1 = E.upsertHistory([], s, res);
const h2 = E.upsertHistory(h1.list, s, res);
check('ประวัติการสอบไม่บันทึกซ้ำเมื่อจบการสอบซ้ำ (attemptId เดียว)', h1.added && !h2.added && h2.list.length === 1);
check('หลังจบการสอบตอบเพิ่มไม่ได้', E.recordAnswer(s, qs[2], 0) === null);

// generated js copy is in sync
const js = fs.readFileSync(path.join(ROOT, 'data', 'questions.js'), 'utf8');
const m = js.match(/window\.TOEIC_BANK = ([\s\S]*);\s*$/);
check('data/questions.js ตรงกับ questions.json (รัน node tools/build-data.cjs หลังแก้ JSON)', m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(bank));

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(__dirname, 'last-validate.json'), JSON.stringify({ date: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
