/*
 * ทดสอบใช้งานจริงแบบ end-to-end ด้วย Playwright (Chromium headless)
 * รัน:  node tests/e2e.test.cjs
 *   - ต้องมี playwright (npm i -D playwright) และ python3 สำหรับเปิด static server ชั่วคราว
 *   - BASE_URL=https://.../  → ทดสอบเว็บที่ deploy แล้วแทน server ในเครื่อง
 * เสียง: headless Chromium ไม่มีเสียงพูด จึงแทน speechSynthesis / SpeechRecognition ด้วยตัวจำลองที่บันทึกสิ่งที่ถูกสั่งพูด
 *        ส่วนไมโครโฟนใช้อุปกรณ์จำลองของ Chromium (--use-fake-device-for-media-stream) และ MediaRecorder จริง
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8600 + Math.floor(Math.random() * 300);
const BASE = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/?$/, '/') : `http://127.0.0.1:${PORT}/`;
const URL = BASE + 'index.html';
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8'));
const Q = bank.questions;

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}
const st = (page) => page.evaluate(() => window.__quest.getState());
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const isHidden = (page, sel) => page.$eval(sel, (e) => e.classList.contains('hidden'));
const cellClass = (page, i) => page.$eval(`#navGroups .cell[data-index="${i}"]`, (e) => e.className);
async function goTo(page, i) { await page.click(`#navGroups .cell[data-index="${i}"]`); }
async function choose(page, idx) { await page.click(`#options .option[data-index="${idx}"]`); }
async function modalOk(page) { await page.click('#modalOk'); await page.waitForSelector('#modal.hidden', { state: 'attached' }); }
const wrongOf = (q) => (q.answer + 1) % q.choices.length;

// fake speech engines (recorded in window.__spoken)
const AUDIO_STUB = `
  window.__spoken = [];
  class FakeUtterance { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.lang = ''; this.voice = null; } }
  const fakeSynth = {
    speaking: false, _q: [],
    getVoices() { return [{ name: 'Samantha', lang: 'en-US' }, { name: 'Daniel', lang: 'en-GB' }, { name: 'Google US English Male', lang: 'en-US' }]; },
    speak(u) { window.__spoken.push({ text: u.text, rate: u.rate, pitch: u.pitch, voice: u.voice && u.voice.name }); this.speaking = true;
      const t = setTimeout(() => { this.speaking = false; u.onend && u.onend(); }, 40); this._q.push(t); },
    cancel() { this._q.forEach(clearTimeout); this._q = []; this.speaking = false; },
    addEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fakeSynth, configurable: true });
  window.SpeechSynthesisUtterance = FakeUtterance;
  class FakeSR {
    start() { this._t = setTimeout(() => {
      const alt = { transcript: 'Hi everyone, my name is Ploy. I am a marketing coordinator at Bright Media.' };
      const res = [Object.assign([alt], { isFinal: true })];
      this.onresult && this.onresult({ results: res });
    }, 600); }
    stop() { clearTimeout(this._t); this.onend && this.onend(); }
    abort() { clearTimeout(this._t); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
`;

async function noDeadButtons(page, cdp, label) {
  const n = await page.evaluate(() => document.querySelectorAll('button').length);
  const dead = [];
  for (let i = 0; i < n; i++) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('button')[${i}]` });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    if (!listeners.some((l) => l.type === 'click')) dead.push(await page.evaluate((k) => { const b = document.querySelectorAll('button')[k]; return b.id || b.className || b.textContent; }, i));
  }
  record(`ไม่มี Dead Buttons: ทุกปุ่ม${label}มี click handler`, dead.length === 0, dead.length ? dead.join(', ') : `${n} ปุ่ม`);
}

async function main() {
  let server = null;
  if (!process.env.BASE_URL) {
    server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 900));
  }
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  await ctx.addInitScript(AUDIO_STUB);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    // ---------------------------------------------------------------- start
    await page.goto(URL);
    await page.waitForSelector('#modal:not(.hidden) #nameInput');
    record('หน้าเว็บโหลดได้และแสดงหน้าต่างเริ่มสอบ', true);
    const counts = await page.$$eval('.info-grid b', (b) => b.map((x) => x.textContent));
    record('หน้าเริ่มแสดง Listening 9 / Reading 9 / Speaking 12', counts.join('/') === '9/9/12', counts.join('/'));
    await page.click('#testAudioBtn');
    record('ปุ่มทดสอบเสียงสั่งอ่านออกเสียงได้', (await page.evaluate(() => window.__spoken.length)) > 0);
    await page.fill('#nameInput', 'Ploy');
    await modalOk(page);
    record('แสดงชื่อผู้ทำ', (await text(page, '#takerName')) === 'Ploy');
    record('Navigator มี 30 ช่อง แบ่ง 3 กลุ่ม', (await page.$$eval('#navGroups .cell', (c) => c.length)) === 30 && (await page.$$eval('.nav-group', (g) => g.length)) === 3);
    const layout = await page.evaluate(() => ({ main: document.getElementById('mainCol').getBoundingClientRect().width, nav: document.getElementById('navCol').getBoundingClientRect().width }));
    const ratio = layout.main / (layout.main + layout.nav);
    record('Layout เดสก์ท็อป: Main ≈ 75% / Navigator ≈ 25%', ratio > 0.7 && ratio < 0.8, `${Math.round(ratio * 100)}%`);
    record('เริ่มที่ QUESTION 1 / 30 และข้อ 1 เป็นข้อปัจจุบัน (กรอบน้ำเงิน)', (await text(page, '#qCounter')) === 'QUESTION 1 / 30' && (await cellClass(page, 0)).includes('current'));
    record('Part 1 มีภาพประกอบ SVG', (await page.$$('#figure:not(.hidden) svg')).length === 1);
    record('Part 1 ซ่อนข้อความตัวเลือกก่อนตอบ (ฟังจากเสียง)', (await page.$$eval('#options .opt-text', (o) => o.every((x) => x.classList.contains('muted')))) &&
      !(await page.$eval('#options', (o) => o.textContent.includes(window.__quest.bank().questions[0].choices[1]))));
    record('Progress bar เริ่มที่ 0', (await page.$eval('#progressFill', (e) => e.style.width)) === '0%');

    // ---------------------------------------------------------------- audio
    await page.click('#transcriptBtn');
    record('Transcript เปิดไม่ได้ก่อนตอบ (แจ้งเตือน)', (await isHidden(page, '#transcript')) && (await text(page, '#toast')).includes('หลังจาก'));
    await page.selectOption('#rateSel', '0.7');
    await page.evaluate(() => { window.__spoken = []; });
    await page.click('#playBtn');
    await page.waitForFunction(() => document.getElementById('audioStatus').textContent.includes('เล่นจบ'));
    const spoken = await page.evaluate(() => window.__spoken);
    record('ปุ่ม Play อ่านบทครบทุกบรรทัดด้วย Speech Synthesis', Q[0].audio.lines.every((l) => spoken.some((s) => l.text.includes(s.text) || s.text.includes(l.text.slice(0, 12)))), spoken.length + ' utterances');
    record('ตัวควบคุมความเร็วเสียงมีผล (0.7x)', spoken.every((s) => s.rate === 0.7));
    await page.waitForFunction(() => document.getElementById('audioStatus').textContent.includes('เล่นจบ'));
    record('สถานะเสียงแสดงว่าเล่นจบแล้ว', true);
    await page.evaluate(() => { window.__spoken = []; });
    await page.click('#replayBtn');
    await page.waitForFunction(() => window.__spoken.length >= 5);
    record('ปุ่ม Replay เล่นซ้ำตั้งแต่ต้น', (await page.evaluate(() => window.__spoken[0].text)).startsWith('Look at the picture'));
    await page.selectOption('#rateSel', '1');
    // conversation uses different voices for man / woman
    await goTo(page, 5);
    await page.evaluate(() => { window.__spoken = []; });
    await page.click('#playBtn');
    await page.waitForFunction(() => window.__spoken.length >= 5);
    const voices = await page.evaluate(() => [...new Set(window.__spoken.map((s) => s.voice))]);
    record('Part 3 ใช้เสียงต่างกันสำหรับผู้หญิงและผู้ชาย', voices.length >= 2, voices.join(' / '));
    await page.click('#playBtn');
    await goTo(page, 0);

    // ---------------------------------------------------------------- instant feedback: wrong
    await page.screenshot({ path: path.join(SHOTS, 'desktop-listening.png') });
    await choose(page, wrongOf(Q[0]));
    record('ตอบผิด: แสดง INCORRECT ทันที', (await text(page, '.fb-result')).includes('INCORRECT'));
    const heads = await page.$$eval('#feedback .fb-h', (h) => h.map((x) => x.textContent.replace(/^\d+/, '').trim()));
    const want = ['Result', 'Correct Answer', 'Why Correct?', 'Why Your Answer Is Wrong?', 'Why Other Choices Are Wrong?', 'Key Vocabulary', 'Grammar Point', 'Real Workplace Application', 'Exam Strategy', 'What You Learned'];
    record('Feedback 10 หัวข้อตามรูปแบบที่กำหนด', JSON.stringify(heads) === JSON.stringify(want), heads.join(' | '));
    record('แสดงคำตอบที่เลือก คำตอบที่ถูก และวิเคราะห์ทุกตัวเลือก',
      (await text(page, '.fb-chosen')).includes(Q[0].choices[wrongOf(Q[0])]) && (await page.$$('#feedback .reason')).length === 4 && (await page.$$('#feedback .trap')).length === 1);
    record('Vocabulary Card มี IPA, คำแปล, ตัวอย่าง, collocations', (await page.$$eval('.vcard', (c) => c.every((x) => x.querySelector('.v-ipa').textContent.startsWith('/') && x.querySelector('.v-th') && x.querySelector('.v-col')))));
    record('ตัวเลือกแสดงสีถูก (เขียว) / ผิด (แดง) และข้อความตัวเลือกถูกเปิดหลังตอบ',
      (await page.$eval(`#options .option[data-index="${Q[0].answer}"]`, (e) => e.className)).includes('correct') &&
      (await page.$eval(`#options .option[data-index="${wrongOf(Q[0])}"]`, (e) => e.className)).includes('wrong') &&
      (await text(page, `#options .option[data-index="${Q[0].answer}"] .opt-text`)) === Q[0].choices[Q[0].answer]);
    record('Navigator ข้อ 1 เป็นสีแดง (ผิด)', (await cellClass(page, 0)).includes('incorrect'));
    // cannot change
    await page.keyboard.press(String(Q[0].answer + 1));
    await page.$eval(`#options .option[data-index="${Q[0].answer}"]`, (b) => b.click());
    const s1 = await st(page);
    record('ยืนยันแล้วเปลี่ยนคำตอบไม่ได้ (คลิก/คีย์ลัด) และไม่นับคะแนนซ้ำ', s1.session.answers[Q[0].id].choice === wrongOf(Q[0]) && Object.keys(s1.session.answers).length === 1);
    await page.click('#transcriptBtn');
    record('Transcript เปิดได้หลังตอบ', !(await isHidden(page, '#transcript')) && (await text(page, '#transcript')).includes('typing'));
    await page.click('.vcard .icon-btn');
    record('ปุ่มฟังคำศัพท์ออกเสียงได้', (await page.evaluate(() => window.__spoken.slice(-1)[0].text)) === Q[0].vocab[0].word);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-feedback-wrong.png'), fullPage: true });

    // ---------------------------------------------------------------- answer all listening + reading
    await page.click('#nextBtn');
    for (let i = 1; i < 18; i++) {
      const q = Q[i];
      const idx = i === 10 ? wrongOf(q) : q.answer; // Q11 deliberately wrong (subject-verb agreement)
      if (i === 2) {
        await page.click('#markBtn');
        record('Mark for Review: ช่องข้อที่ยังไม่ตอบเป็นสีเหลือง', (await cellClass(page, 2)).includes('marked') && (await cellClass(page, 2)).includes('unanswered'));
      }
      await page.keyboard.press(String(idx + 1));
      await page.waitForSelector('#feedback:not(.hidden)');
      if (i === 1) record('ตอบถูก: แสดง CORRECT และ Why Your Answer Is Right', (await text(page, '.fb-result')).includes('CORRECT') && !(await text(page, '.fb-result')).includes('INCORRECT'));
      if (i === 9) await page.screenshot({ path: path.join(SHOTS, 'desktop-reading.png'), fullPage: true });
      await page.click('#nextBtn');
    }
    record('ทำ Listening + Reading ครบ 18 ข้อ และถูก/ผิดตรงตามที่ตอบ', (await page.evaluate(() => {
      const s = window.__quest.getState().session; return Object.values(s.answers).filter((a) => a.correct).length;
    })) === 16);
    record('Navigator ข้อ 2 สีเขียว และข้อ 3 ที่ทำเครื่องหมายมีดาว', (await cellClass(page, 1)).includes('correct') && (await cellClass(page, 2)).includes('correct marked'));
    record('Section tabs นับความคืบหน้า', (await page.$eval('.tab-reading .n', (e) => e.textContent)) === '9/9');

    // ---------------------------------------------------------------- speaking
    record('ข้อ 19 เป็น Speaking (หน้าพิมพ์คำตอบ + ไมโครโฟน)', (await text(page, '#qCounter')) === 'QUESTION 19 / 30' && !(await isHidden(page, '#speakingBox')));
    await page.click('#spListenBtn');
    record('ปุ่มฟังโจทย์ Speaking อ่านโจทย์ได้', (await page.evaluate(() => window.__spoken.slice(-1)[0].text)) === Q[18].prompt.match(/[^.!?]+[.!?]/)[0].trim());
    await page.click('#spTimerBtn');
    await page.waitForTimeout(1100);
    record('ตัวจับเวลาฝึกพูดทำงาน (เวลาเตรียม)', (await text(page, '#spTimer')).includes('เตรียมตัว'));
    await page.click('#spTimerBtn');
    await page.fill('#spText', Q[18].sample);
    record('นับจำนวนคำแบบ real-time', (await text(page, '#spCount')).startsWith(String((Q[18].sample.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g) || []).length)));
    await page.click('#spSubmit');
    await page.waitForSelector('#feedback:not(.hidden)');
    const spScore = Number((await text(page, '.fb-result')).match(/(\d+)\/100/)[1]);
    record('ส่ง Speaking ตัวอย่างที่ดี: ได้คะแนน ≥ 85 และช่องเป็นสีเขียว', spScore >= 85 && (await cellClass(page, 18)).includes('correct'), spScore);
    record('Speaking feedback มี 10 หัวข้อ รวมตัวอย่างคำตอบและเกณฑ์ Grammar/Vocabulary/Structure/Fluency/Natural',
      (await page.$$('#feedback .fb-h')).length === 10 && (await page.$$('#feedback .crit-row')).length === 5 && (await page.$$('#feedback .sample')).length === 1);
    record('Fluency ไม่ถูกประเมินเมื่อไม่มีเสียง', (await page.$$('#feedback .crit-na')).length === 1);
    record('ส่งแล้วแก้คำตอบไม่ได้ (readonly + ไม่มีปุ่มส่ง)', (await page.$eval('#spText', (t) => t.readOnly)) && (await isHidden(page, '#spSubmit')));
    await page.screenshot({ path: path.join(SHOTS, 'desktop-speaking-feedback.png'), fullPage: true });

    await page.click('#nextBtn');
    await page.fill('#spText', 'Hello. I am work at a company. i very like it.');
    await page.click('#spSubmit');
    await page.waitForSelector('#modal:not(.hidden)');
    record('คำตอบสั้นเกินไปมีหน้าต่างยืนยันก่อนส่ง', (await text(page, '#modalTitle')).includes('สั้น'));
    await modalOk(page);
    const weak = Number((await text(page, '.fb-result')).match(/(\d+)\/100/)[1]);
    record('คำตอบที่ผิดไวยากรณ์/สั้นได้คะแนนต่ำ ช่องเป็นสีแดง และชี้จุดผิดพร้อมวิธีแก้', weak < 60 && (await cellClass(page, 19)).includes('incorrect') && (await page.$$('#feedback .iss-fix')).length >= 3, weak);

    // microphone (fake device) + speech-to-text
    await page.click('#nextBtn');
    await page.click('#recBtn');
    await page.waitForFunction(() => document.getElementById('recBtn').classList.contains('recording'), null, { timeout: 5000 });
    await page.waitForTimeout(3600);
    record('อัดเสียงผ่านไมโครโฟนได้ และถอดเสียงเป็นข้อความลงช่องคำตอบ', (await page.$eval('#spText', (t) => t.value)).includes('my name is Ploy'));
    await page.click('#recBtn');
    await page.waitForSelector('#recAudio:not(.hidden)', { timeout: 5000 });
    record('หยุดอัดแล้วฟังเสียงตัวเองได้ (audio player)', (await page.$eval('#recAudio', (a) => a.src)).startsWith('blob:'));
    await page.fill('#spText', 'Hi everyone, my name is Ploy. I am a marketing coordinator at Bright Media. I mainly plan social media campaigns for our clients. I really enjoy creating short videos because I love telling stories. Nice to meet you all, and I look forward to working with you.');
    await page.click('#spSubmit');
    await page.waitForSelector('#feedback:not(.hidden)');
    record('คำตอบที่อัดเสียงได้รับการประเมิน Fluency', (await page.$$('#feedback .crit-na')).length === 0 && (await st(page)).session.speaking[Q[20].id].voice === true);

    // ---------------------------------------------------------------- navigator & persistence
    await goTo(page, 0);
    record('คลิก Navigator กลับไปข้อที่ตอบแล้วอ่านคำอธิบายได้', (await text(page, '.fb-result')).includes('INCORRECT') && (await page.$$('#options .option:not([disabled])')).length === 0);
    await goTo(page, 23);
    const before = await st(page);
    await page.waitForTimeout(1200);
    await page.reload();
    await page.waitForSelector('#qCounter');
    const after = await st(page);
    record('Refresh แล้วข้อมูลไม่หาย (คำตอบ, Speaking, ข้อปัจจุบัน, เครื่องหมาย, ชื่อ)',
      Object.keys(after.session.answers).length === 18 && Object.keys(after.session.speaking).length === 3 && after.session.current === 23 &&
      after.session.marked.includes(Q[2].id) && (await text(page, '#takerName')) === 'Ploy' && (await isHidden(page, '#modal')));
    record('เวลาที่ใช้ไม่ถูกรีเซ็ตหลัง Refresh', after.session.elapsedMs >= before.session.elapsedMs - 5000 && after.session.elapsedMs > 0, after.session.elapsedMs);
    await page.fill('#spText', 'Draft answer that is not submitted yet');
    await page.reload();
    await page.waitForSelector('#qCounter');
    record('ร่างคำตอบ Speaking ที่ยังไม่ส่งถูกบันทึกไว้', (await page.$eval('#spText', (t) => t.value)) === 'Draft answer that is not submitted yet');
    await noDeadButtons(page, cdp, 'ในหน้าข้อสอบ');

    // ---------------------------------------------------------------- finish & analytics
    await page.click('#finishBtn');
    await page.waitForSelector('#modal:not(.hidden)');
    record('จบการสอบก่อนครบ: เตือนจำนวนข้อที่ยังไม่ทำ', (await text(page, '#modalBody')).includes('9 ข้อ'));
    await modalOk(page);
    await page.waitForSelector('#resultView:not(.hidden)');
    const res = await page.evaluate(() => window.__quest.analyze());
    record('Performance: L&R ถูก 16 ผิด 2 (Accuracy 88.9%)', res.lr.correct === 16 && res.lr.wrong === 2 && res.lr.pct === 88.9 && (await text(page, '.score-pct')) === '89%');
    record('แสดงเวลาที่ใช้', (await text(page, '.result-stats')).includes('เวลาที่ใช้'));
    record('Skill Analysis 3 ทักษะ พร้อมสัดส่วน 30/30/40', (await page.$$eval('.skill-card .sc-weight', (w) => w.map((x) => x.textContent))).join('|') === '30% · 9 ข้อ|30% · 9 ข้อ|40% · 12 ข้อ');
    record('Knowledge Analysis 4 ด้าน (Grammar / Vocabulary / Listening / Reading Comprehension)', (await page.$$('.know-card')).length === 4);
    record('Grammar Weakness ระบุหัวข้อที่ผิด (Subject-Verb Agreement)', (await page.$eval('.know-card', (c) => c.textContent)).includes('Subject-Verb Agreement'));
    const recs = await page.$$eval('.rec-card h4', (h) => h.map((x) => x.textContent));
    record('Learning Recommendations ครบ 5 หัวข้อ', ['เรื่องที่ควรกลับไปทบทวน', 'คำศัพท์ที่ยังไม่เข้าใจ', 'Grammar ที่ยังผิดบ่อย', 'ทักษะที่ต้องเพิ่มเวลาในการฝึก', 'แนวทางการเรียนในวันถัดไป'].every((t) => recs.includes(t)));
    const resultText = await text(page, '#resultView');
    record('ไม่แปลงคะแนนเป็น TOEIC 990 และรายงาน Speaking แยกจาก L&R', !/\d+\s*\/\s*990/.test(resultText) && resultText.includes('แยกจาก L&R') && resultText.includes('ไม่ควรแปลง'));
    record('ประวัติการสอบบันทึก 1 รายการ', (await page.$$('#resultView .topic-table tbody tr.cur')).length === 1);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-result.png'), fullPage: true });
    await noDeadButtons(page, cdp, 'ในหน้าผลวิเคราะห์');

    // review after finish, no double scoring
    await page.click('.rec-card .goto');
    record('ลิงก์ "ข้อ N" ในคำแนะนำพาไปยังข้อนั้น', !(await isHidden(page, '#examView')));
    await goTo(page, 29);
    record('ข้อที่ไม่ได้ทำ: หลังจบสอบดูคำตอบตัวอย่างได้ แต่ส่งไม่ได้', (await text(page, '.fb-result')).includes('ไม่ได้ส่ง') && (await isHidden(page, '#spSubmit')));
    await page.click('#finishBtn');
    await page.waitForSelector('#resultView:not(.hidden)');
    await page.reload();
    await page.waitForSelector('#resultView:not(.hidden)');
    const hist = (await st(page)).history;
    record('รีเฟรช/กดดูผลซ้ำ: ผลยังอยู่ และไม่บันทึกคะแนนซ้ำ', hist.length === 1 && (await page.evaluate(() => window.__quest.analyze().lr.correct)) === 16);

    // restart keeps history
    await page.click('#restartBtn');
    await modalOk(page);
    await page.waitForSelector('#modal:not(.hidden) #nameInput');
    record('เริ่มชุดใหม่: กรอกชื่อเดิมไว้ให้', (await page.$eval('#nameInput', (i) => i.value)) === 'Ploy');
    await modalOk(page);
    const fresh = await st(page);
    record('เริ่มชุดใหม่ได้ คำตอบว่าง และประวัติเดิมยังอยู่', Object.keys(fresh.session.answers).length === 0 && fresh.history.length === 1 && fresh.session.attemptId !== hist[0].attemptId);

    // ---------------------------------------------------------------- responsive
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await m.addInitScript(AUDIO_STUB);
    const mp = await m.newPage();
    mp.on('pageerror', (e) => errors.push('mobile: ' + e.message));
    await mp.goto(URL);
    await mp.waitForSelector('#nameInput');
    await mp.screenshot({ path: path.join(SHOTS, 'mobile-start.png') });
    await mp.fill('#nameInput', 'Mobile');
    await mp.click('#modalOk');
    await mp.waitForTimeout(300);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    record('Mobile 390px: ไม่มี horizontal scroll', overflow <= 0, overflow);
    const order = await mp.evaluate(() => document.getElementById('navCol').getBoundingClientRect().top > document.getElementById('mainCol').getBoundingClientRect().top);
    record('Mobile: Navigator ย้ายลงไปใต้คำถาม', order);
    await mp.screenshot({ path: path.join(SHOTS, 'mobile-listening.png') });
    await mp.tap(`#options .option[data-index="${Q[0].answer}"]`);
    await mp.waitForSelector('#feedback:not(.hidden)');
    record('Mobile: แตะตอบแล้วเห็น feedback', (await mp.$eval('.fb-result', (e) => e.textContent)).includes('CORRECT'));
    await mp.screenshot({ path: path.join(SHOTS, 'mobile-feedback.png'), fullPage: true });
    await mp.tap('#navGroups .cell[data-index="18"]');
    await mp.waitForTimeout(200);
    record('Mobile: หน้า Speaking ไม่ล้นจอ', (await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    await mp.screenshot({ path: path.join(SHOTS, 'mobile-speaking.png') });
    await m.close();

    // ---------------------------------------------------------------- open directly from disk
    if (!process.env.BASE_URL) {
      const fp = await ctx.newPage();
      await fp.goto('file://' + path.join(ROOT, 'index.html'));
      await fp.waitForSelector('#modal:not(.hidden) #nameInput', { timeout: 5000 });
      record('เปิด index.html ตรงจากไฟล์ (file://) ได้โดยไม่ต้องมี server', true);
      await fp.close();
    }

    record('ไม่มี JavaScript error ใน console', errors.length === 0, errors.join(' | '));
  } catch (e) {
    record('การทดสอบทำงานจนจบ', false, e.stack);
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify({ date: new Date().toISOString(), url: URL, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
main();
