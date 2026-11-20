/*
 * TOEIC Foundation Quest — UI controller (vanilla JS, classic script)
 * Depends on: window.TOEIC_BANK, TQExam, TQStore, TQAudio, TQIllustrations
 */
(function () {
  'use strict';
  const E = window.TQExam;
  const Store = window.TQStore;
  const { tts, Recorder } = window.TQAudio;
  const ILL = window.TQIllustrations || {};

  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function h(tag, cls, children) {
    const n = el(tag, cls);
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return n;
  }

  let bank = null;
  let byId = {};
  let state = { name: '', session: null, history: [], settings: { rate: 1 } };
  let recorder = null;
  let practiceTimer = null;
  let audioStatusTimer = null;

  const S = () => state.session;
  const curQ = () => byId[S().ids[S().current]];
  const persist = () => Store.save(state);
  const SKILL_LABEL = { listening: 'Listening', reading: 'Reading', speaking: 'Speaking' };
  const SKILL_TH = { listening: 'การฟัง', reading: 'การอ่าน', speaking: 'การพูด' };
  const letter = (i) => E.LETTERS[i];

  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms || 2800);
  }

  // ------------------------------------------------------------------ modal
  let modalHandlers = null;
  function openModal(o) {
    $('modalTitle').textContent = o.title;
    const b = $('modalBody');
    b.replaceChildren();
    if (typeof o.body === 'string') b.innerHTML = o.body; else if (o.body) b.append(o.body);
    const ok = $('modalOk');
    ok.textContent = o.okText || 'ตกลง';
    ok.className = 'btn ' + (o.okClass || 'btn-primary');
    const cancel = $('modalCancel');
    cancel.textContent = o.cancelText || '';
    cancel.classList.toggle('hidden', !o.cancelText);
    modalHandlers = { onOk: o.onOk, onCancel: o.onCancel };
    $('modal').classList.remove('hidden');
    setTimeout(() => { const f = o.focus ? $(o.focus) : ok; if (f) f.focus(); }, 30);
  }
  function closeModal() { $('modal').classList.add('hidden'); modalHandlers = null; }
  $('modalOk').addEventListener('click', () => {
    const fn = modalHandlers && modalHandlers.onOk;
    if (fn && fn() === false) return;
    closeModal();
  });
  $('modalCancel').addEventListener('click', () => {
    const fn = modalHandlers && modalHandlers.onCancel;
    closeModal();
    if (fn) fn();
  });

  // ------------------------------------------------------------------ boot
  async function loadBank() {
    if (window.TOEIC_BANK) return window.TOEIC_BANK;
    const r = await fetch('data/questions.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function boot() {
    try {
      bank = await loadBank();
    } catch (e) {
      show('errorView');
      $('errorMsg').textContent = 'ไม่พบไฟล์ data/questions.js หรือ data/questions.json (' + e.message + ') ตรวจสอบว่าไฟล์ในโฟลเดอร์ data ครบ';
      return;
    }
    byId = Object.fromEntries(bank.questions.map((q) => [q.id, q]));
    const saved = Store.load();
    if (saved && saved.session && Array.isArray(saved.session.ids) && saved.session.ids.every((id) => byId[id])) {
      state = Object.assign({ name: '', history: [], settings: { rate: 1 } }, saved);
    } else if (saved) {
      state.history = saved.history || [];
      state.name = saved.name || '';
      state.settings = saved.settings || { rate: 1 };
    }
    $('rateSel').value = String(state.settings.rate || 1);
    if (!$('rateSel').value) $('rateSel').value = '1';
    buildSectionTabs();
    buildNavigator();
    if (S()) render(); else startDialog();
    setInterval(tick, 1000);
  }

  // ------------------------------------------------------------------ start dialog
  function startDialog(isRestart) {
    const wrap = el('div');
    wrap.innerHTML = `
      <p>แบบฝึกสอบพื้นฐาน TOEIC 30 ข้อ ตรวจคำตอบทันทีทุกข้อ พร้อมคำอธิบายภาษาไทยและตัวอย่างภาษาอังกฤษจากสถานการณ์ทำงานจริง</p>
      <div class="info-grid">
        <div class="ig-l"><b>9</b>Listening<small>30%</small></div>
        <div class="ig-r"><b>9</b>Reading<small>30%</small></div>
        <div class="ig-s"><b>12</b>Speaking<small>40%</small></div>
      </div>
      <ul>
        <li>เลือกคำตอบแล้วระบบ<b>ล็อกคำตอบและตรวจทันที</b> เปลี่ยนคำตอบไม่ได้ แต่กลับไปอ่านคำอธิบายได้เสมอ</li>
        <li>Listening ใช้เสียงอ่านของเบราว์เซอร์ ปรับความเร็วได้ Transcript เปิดได้หลังตอบ</li>
        <li>Speaking พิมพ์หรืออัดเสียงผ่านไมโครโฟนได้ ส่งแล้วจะเห็นคำตอบตัวอย่างและผลประเมิน</li>
        <li>ความคืบหน้าบันทึกในเบราว์เซอร์อัตโนมัติ รีเฟรชแล้วทำต่อได้</li>
      </ul>
      <p class="warn">Foundation Assessment นี้ไม่ใช่ข้อสอบ TOEIC มาตรฐาน ผลที่ได้ไม่แปลงเป็นคะแนน 990 และคะแนน Speaking แยกจาก Listening &amp; Reading</p>
      <label for="nameInput">ชื่อผู้ทำแบบทดสอบ</label>
      <input type="text" id="nameInput" maxlength="40" placeholder="เช่น Ploy" autocomplete="off">
      <div class="audio-check">
        <button type="button" class="btn btn-ghost btn-sm" id="testAudioBtn">🔊 ทดสอบเสียง</button>
        <span id="testAudioMsg"></span>
      </div>`;
    openModal({
      title: isRestart ? 'เริ่มทำแบบทดสอบชุดใหม่' : 'TOEIC Foundation — Interactive Exam',
      body: wrap,
      okText: 'เริ่มทำข้อสอบ',
      cancelText: isRestart ? 'ยกเลิก' : '',
      focus: 'nameInput',
      onOk: () => {
        const name = $('nameInput').value.trim() || 'ผู้เรียน';
        state.name = name;
        state.session = E.createSession(bank, name);
        persist();
        stopAll();
        render();
        return true;
      },
    });
    $('nameInput').value = state.name || '';
    $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('modalOk').click(); });
    $('testAudioBtn').addEventListener('click', () => {
      if (!tts.supported) { $('testAudioMsg').textContent = 'เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน แนะนำ Chrome หรือ Edge'; return; }
      tts.say('Welcome to the TOEIC Foundation practice test. Good luck!', Number($('rateSel').value) || 1);
      $('testAudioMsg').textContent = 'ถ้าไม่ได้ยินเสียง ตรวจสอบระดับเสียงของเครื่อง';
    });
  }

  // ------------------------------------------------------------------ views
  function show(view) {
    ['examView', 'resultView', 'errorView'].forEach((v) => $(v).classList.toggle('hidden', v !== view));
  }

  function render() {
    const s = S();
    if (!s) return;
    if (s.view === 'result' && s.finished) { renderResult(); show('resultView'); }
    else { renderQuestion(); show('examView'); }
    renderNavigator();
    renderTop();
  }

  function renderTop() {
    const s = S();
    const n = E.answeredCount(s);
    $('answeredCount').textContent = n;
    $('answeredTotal').textContent = s.ids.length;
    $('progressFill').style.width = (n / s.ids.length) * 100 + '%';
    $('progressBar').setAttribute('aria-valuenow', n);
    $('takerName').textContent = s.name || state.name || '-';
    $('timer').textContent = E.clock(s.elapsedMs);
    $('finishBtn').textContent = s.finished ? 'ดูผลวิเคราะห์' : 'จบการสอบและดูผลวิเคราะห์';
    // section tabs
    document.querySelectorAll('#sectionTabs .tab').forEach((t) => {
      const sk = t.dataset.skill;
      const ids = s.ids.filter((id) => byId[id].skill === sk);
      const done = ids.filter((id) => E.isDone(s, id)).length;
      t.querySelector('.n').textContent = `${done}/${ids.length}`;
      t.classList.toggle('active', s.view !== 'result' && curQ().skill === sk);
    });
  }

  function tick() {
    const s = S();
    if (!s || s.finished || document.hidden || !$('modal').classList.contains('hidden')) return;
    s.elapsedMs = (s.elapsedMs || 0) + 1000;
    $('timer').textContent = E.clock(s.elapsedMs);
    if (s.elapsedMs % 5000 === 0) persist();
  }

  // ------------------------------------------------------------------ section tabs + navigator
  function skillRange(sk) {
    const nums = bank.questions.filter((q) => q.skill === sk).map((q) => q.no);
    return [Math.min(...nums), Math.max(...nums)];
  }
  function buildSectionTabs() {
    const box = $('sectionTabs');
    box.replaceChildren();
    for (const sk of E.SKILLS) {
      const [a, b] = skillRange(sk);
      const t = h('button', 'tab tab-' + sk, [
        h('span', 'tab-name', SKILL_LABEL[sk]),
        h('span', 'tab-range', ` ข้อ ${a}–${b} · ${bank.skills[sk].weight}%`),
        h('span', 'n', ''),
      ]);
      t.type = 'button';
      t.dataset.skill = sk;
      t.setAttribute('role', 'tab');
      t.addEventListener('click', () => {
        const idx = S().ids.findIndex((id) => byId[id].skill === sk && !E.isDone(S(), id));
        goTo(idx >= 0 ? idx : S().ids.findIndex((id) => byId[id].skill === sk));
      });
      box.append(t);
    }
  }

  function buildNavigator() {
    const box = $('navGroups');
    box.replaceChildren();
    for (const sk of E.SKILLS) {
      const [a, b] = skillRange(sk);
      const grp = el('div', 'nav-group');
      grp.append(h('p', 'nav-group-title', [h('span', 'dot dot-' + sk, ''), `${SKILL_LABEL[sk].toUpperCase()} · ข้อ ${a}–${b}`]));
      const grid = el('div', 'grid');
      bank.questions.forEach((q, i) => {
        if (q.skill !== sk) return;
        const c = el('button', 'cell', String(q.no));
        c.type = 'button';
        c.dataset.index = i;
        c.dataset.id = q.id;
        c.addEventListener('click', () => goTo(i));
        grid.append(c);
      });
      grp.append(grid);
      box.append(grp);
    }
  }

  function renderNavigator() {
    const s = S();
    const showCurrent = s.view !== 'result';
    document.querySelectorAll('#navGroups .cell').forEach((c) => {
      const i = Number(c.dataset.index);
      const q = byId[c.dataset.id];
      const st = E.statusOf(s, q);
      const marked = s.marked.includes(q.id);
      c.className = 'cell ' + st + (marked ? ' marked' : '') + (showCurrent && i === s.current ? ' current' : '');
      const label = { correct: 'ถูก', incorrect: q.skill === 'speaking' ? 'ควรฝึกเพิ่ม' : 'ผิด', unanswered: 'ยังไม่ตอบ' }[st];
      c.title = `ข้อ ${q.no} · ${SKILL_LABEL[q.skill]} · ${label}${marked ? ' · ทำเครื่องหมายทบทวน' : ''}`;
      c.setAttribute('aria-label', c.title);
      if (showCurrent && i === s.current) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
    });
    const counts = { correct: 0, incorrect: 0, unanswered: 0 };
    s.ids.forEach((id) => counts[E.statusOf(s, byId[id])]++);
    $('navStats').innerHTML = `
      <div class="stat ok"><b>${counts.correct}</b><span>ถูก/ผ่าน</span></div>
      <div class="stat bad"><b>${counts.incorrect}</b><span>ผิด/ฝึกเพิ่ม</span></div>
      <div class="stat"><b>${counts.unanswered}</b><span>ยังไม่ตอบ</span></div>`;
  }

  function goTo(i) {
    const s = S();
    if (!s || i < 0 || i >= s.ids.length) return;
    stopAll();
    s.current = i;
    s.view = 'exam';
    persist();
    render();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  // ------------------------------------------------------------------ question
  function stopAll() {
    if (tts.playing) tts.stop(true); else tts.stop(true);
    setPlaying(false);
    if (recorder) { recorder.dispose(); recorder = null; }
    if (practiceTimer) { clearInterval(practiceTimer.id); practiceTimer = null; }
  }

  function badge(text, cls) { return el('span', 'badge ' + (cls || ''), text); }

  function renderQuestion() {
    const s = S();
    const q = curQ();
    const locked = E.isDone(s, q.id) || s.finished;
    $('qCounter').textContent = `QUESTION ${q.no} / ${s.ids.length}`;
    $('sectionLine').textContent = `${SKILL_LABEL[q.skill]} · ${q.part.replace(/^Speaking: /, '')}`;

    const b = $('badges');
    b.replaceChildren(
      badge(SKILL_LABEL[q.skill], 'skill ' + q.skill),
      badge(q.part.replace(/^Speaking: /, ''), 'part'),
      badge(bank.difficulties[q.difficulty], 'diff ' + q.difficulty),
    );
    if (s.marked.includes(q.id)) b.append(badge('★ ทบทวน', 'marked-badge'));

    // question text
    const isSp = q.skill === 'speaking';
    $('qText').textContent = isSp ? q.topic.replace(/^[^:]+:\s*/, '') : q.question;
    $('qText').classList.toggle('q-en', !isSp && !/[฀-๿]/.test(q.question));
    const sub = q.questionTh || (isSp ? '' : '');
    $('qSub').textContent = sub;
    $('qSub').classList.toggle('hidden', !sub);

    // audio panel
    const hasAudio = q.skill === 'listening';
    $('audioPanel').classList.toggle('hidden', !hasAudio);
    if (hasAudio) {
      setPlaying(false);
      $('audioStatus').textContent = tts.supported
        ? 'กด "เล่นเสียง" เพื่อฟังโจทย์ (ฟังซ้ำได้ไม่จำกัด ปรับความเร็วได้)'
        : 'เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน (Speech Synthesis) — เปิด Transcript อ่านแทนได้ แนะนำให้ใช้ Chrome หรือ Edge';
    }

    // figure
    const fig = $('figure');
    if (q.image && ILL[q.image]) { fig.innerHTML = ILL[q.image]; fig.classList.remove('hidden'); }
    else { fig.replaceChildren(); fig.classList.add('hidden'); }

    // passage
    const pas = $('passage');
    pas.replaceChildren();
    if (q.passage) {
      pas.append(el('p', 'passage-kind', q.passage.kind));
      const body = el('div', 'passage-body');
      q.passage.text.split('\n').forEach((line) => {
        const p = el('p', line.trim() ? '' : 'gap');
        const parts = line.split(/(___\(\d\)___)/);
        parts.forEach((part) => {
          const m = part.match(/^___\((\d)\)___$/);
          if (m) p.append(el('span', 'blank', `(${m[1]})`));
          else if (part) p.append(document.createTextNode(part));
        });
        body.append(p);
      });
      pas.append(body);
      pas.classList.remove('hidden');
    } else pas.classList.add('hidden');

    // options / speaking
    $('options').classList.toggle('hidden', isSp);
    $('speakingBox').classList.toggle('hidden', !isSp);
    if (isSp) renderSpeaking(q, locked); else renderOptions(q, locked);

    // transcript
    $('transcriptWrap').classList.toggle('hidden', !hasAudio);
    $('transcript').classList.add('hidden');
    if (hasAudio) {
      const open = locked && s.transcripts[q.id];
      renderTranscript(q);
      $('transcript').classList.toggle('hidden', !open);
      $('transcriptBtn').textContent = locked ? (open ? '📄 ซ่อน Transcript' : '📄 แสดง Transcript') : '🔒 Transcript (เปิดได้หลังตอบ)';
      $('transcriptBtn').classList.toggle('locked', !locked);
    }

    // feedback
    const fb = $('feedback');
    if (locked) {
      fb.replaceChildren(isSp ? speakingFeedback(q) : mcqFeedback(q));
      fb.className = 'feedback ' + feedbackClass(q);
    } else { fb.replaceChildren(); fb.className = 'feedback hidden'; }

    // actions
    $('prevBtn').disabled = s.current === 0;
    const last = s.current === s.ids.length - 1;
    $('nextBtn').textContent = last ? (s.finished ? 'ดูผลวิเคราะห์ →' : 'จบการสอบ →') : 'ข้อถัดไป →';
    const marked = s.marked.includes(q.id);
    $('markBtn').classList.toggle('active', marked);
    $('markBtn').querySelector('.star').textContent = marked ? '★' : '☆';
    $('markBtn').querySelector('.lbl').textContent = marked ? 'เลิกทำเครื่องหมาย' : 'ทบทวนทีหลัง';
  }

  function feedbackClass(q) {
    const st = E.statusOf(S(), q);
    return st === 'correct' ? 'ok' : st === 'incorrect' ? 'bad' : 'none';
  }

  function renderOptions(q, locked) {
    const s = S();
    const box = $('options');
    box.replaceChildren();
    const ans = s.answers[q.id];
    const hidden = q.hideChoices && !locked;
    q.choices.forEach((c, i) => {
      const b = el('button', 'option');
      b.type = 'button';
      b.dataset.index = i;
      const radio = el('span', 'radio');
      const lt = el('span', 'letter', `(${letter(i)})`);
      const tx = el('span', 'opt-text' + (hidden ? ' muted' : ''), hidden ? `ตัวเลือก (${letter(i)}) — ฟังจากเสียง` : c);
      const mk = el('span', 'mark-icon', '');
      b.append(radio, lt, tx, mk);
      if (locked) {
        b.disabled = true;
        if (i === q.answer) { b.classList.add('correct'); mk.textContent = '✓'; }
        if (ans && ans.choice === i) { b.classList.add('selected'); if (i !== q.answer) { b.classList.add('wrong'); mk.textContent = '✗'; } }
        if (i !== q.answer && !(ans && ans.choice === i)) b.classList.add('dim');
      } else {
        b.addEventListener('click', () => choose(i));
      }
      box.append(b);
    });
    if (q.hideChoices && !locked) box.append(el('p', 'opt-hint', q.partKey === 'p1'
      ? 'Part 1: ข้อความของตัวเลือกจะไม่แสดงบนจอ เหมือนข้อสอบจริง ฟังจากเสียงแล้วเลือกตัวอักษร'
      : 'Part 2: คำถามและตัวเลือกอยู่ในเสียงเท่านั้น เหมือนข้อสอบจริง'));
  }

  function choose(i) {
    const s = S();
    const q = curQ();
    if (q.skill === 'speaking') return;
    const rec = E.recordAnswer(s, q, i);
    if (!rec) { toast('ข้อนี้ยืนยันคำตอบแล้ว เปลี่ยนคำตอบไม่ได้ แต่ยังอ่านคำอธิบายได้'); return; }
    tts.stop(true);
    setPlaying(false);
    persist();
    renderQuestion();
    renderNavigator();
    renderTop();
    const fb = $('feedback');
    if (fb && fb.scrollIntoView) setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ------------------------------------------------------------------ listening audio
  function setPlaying(on) {
    const pb = $('playBtn');
    pb.textContent = on ? '■ หยุด' : '▶ เล่นเสียง';
    pb.classList.toggle('playing', on);
    $('wave').classList.toggle('on', on);
  }
  function playCurrent(fromStart) {
    const q = curQ();
    if (!q.audio) return;
    if (!tts.supported) {
      toast('เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน ใช้ Chrome หรือ Edge หรือเปิด Transcript อ่านแทน', 3600);
      const s = S();
      s.transcripts[q.id] = true; // fallback: let the learner read instead of listening
      $('transcript').classList.remove('hidden');
      return;
    }
    if (tts.playing && !fromStart) { tts.stop(true); setPlaying(false); $('audioStatus').textContent = 'หยุดเสียงแล้ว กด "เล่นเสียง" หรือ "เล่นซ้ำ" เพื่อฟังอีกครั้ง'; return; }
    const rate = Number($('rateSel').value) || 1;
    const lines = q.audio.lines;
    setPlaying(true);
    const qid = q.id;
    tts.play(lines, {
      rate,
      onLine: (li, n) => {
        if (curQ().id !== qid) return;
        $('audioStatus').textContent = `กำลังเล่น ${li + 1}/${n} · ความเร็ว ${rate}x`;
      },
      onEnd: (completed) => {
        if (curQ().id !== qid) return;
        setPlaying(false);
        if (completed) $('audioStatus').textContent = 'เล่นจบแล้ว — เลือกคำตอบ หรือกด "เล่นซ้ำ" เพื่อฟังอีกครั้ง';
      },
    });
  }
  $('playBtn').addEventListener('click', () => playCurrent(false));
  $('replayBtn').addEventListener('click', () => playCurrent(true));
  $('rateSel').addEventListener('change', () => {
    state.settings.rate = Number($('rateSel').value) || 1;
    persist();
    toast(`ตั้งความเร็วเสียง ${state.settings.rate}x แล้ว${tts.playing ? ' (เริ่มเล่นใหม่ด้วยความเร็วนี้)' : ''}`);
    if (tts.playing) playCurrent(true);
  });

  function renderTranscript(q) {
    const t = $('transcript');
    t.replaceChildren();
    const who = { W: 'Woman', M: 'Man', N: q.partKey === 'p4' ? 'Speaker' : 'Narrator' };
    q.audio.lines.forEach((l) => {
      const row = el('p', 'tr-line');
      row.append(el('b', 'tr-sp sp-' + l.sp, who[l.sp] || l.sp), document.createTextNode(' ' + l.text));
      const say = el('button', 'icon-btn', '🔊');
      say.type = 'button';
      say.title = 'ฟังบรรทัดนี้';
      say.setAttribute('aria-label', 'ฟังบรรทัดนี้');
      say.addEventListener('click', () => speakOnce([l]));
      row.append(say);
      t.append(row);
    });
  }
  $('transcriptBtn').addEventListener('click', () => {
    const s = S();
    const q = curQ();
    if (!(E.isDone(s, q.id) || s.finished)) {
      toast('Transcript จะเปิดได้หลังจากตอบข้อนี้แล้ว เพื่อฝึกฟังจริงก่อน');
      return;
    }
    const t = $('transcript');
    const open = t.classList.contains('hidden');
    t.classList.toggle('hidden', !open);
    s.transcripts[q.id] = open;
    persist();
    $('transcriptBtn').textContent = open ? '📄 ซ่อน Transcript' : '📄 แสดง Transcript';
  });

  function speakOnce(lines) {
    if (!tts.supported) { toast('เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน แนะนำ Chrome หรือ Edge'); return; }
    setPlaying(false);
    tts.play(lines, { rate: Number($('rateSel').value) || 1 });
  }

  // ------------------------------------------------------------------ speaking
  function renderSpeaking(q, locked) {
    const s = S();
    $('spSituation').replaceChildren(h('span', 'sp-label', 'สถานการณ์'), ' ' + q.situation);
    $('spPrompt').textContent = q.prompt;
    $('spPromptTh').textContent = q.promptTh;
    $('spMeta').replaceChildren(
      el('span', 'chip-info', `เวลาเตรียม ${q.prepSeconds} วินาที`),
      el('span', 'chip-info', `เวลาพูด ${q.responseSeconds} วินาที`),
      el('span', 'chip-info', `อย่างน้อย ${q.minWords} คำ / ${q.minSentences} ประโยค`),
      el('span', 'chip-info', 'ต้องมี: ' + q.required.map((r) => r.label).join(' · ')),
    );
    $('spTimer').textContent = '';
    $('spTimerBtn').textContent = '⏱ เริ่มจับเวลาฝึก';
    const ta = $('spText');
    const sub = s.speaking[q.id];
    ta.value = sub ? sub.text : (s.drafts[q.id] || '');
    ta.readOnly = locked;
    ta.classList.toggle('locked', locked);
    $('spSubmit').classList.toggle('hidden', locked);
    $('spTimerBtn').disabled = locked;
    $('recBtn').disabled = locked;
    $('recAudio').classList.add('hidden');
    $('recAudio').removeAttribute('src');
    $('recBtn').textContent = '🎙 เริ่มอัดเสียง';
    $('recBtn').classList.remove('recording');
    $('recStatus').textContent = locked
      ? (sub && sub.voice ? 'ส่งคำตอบแบบอัดเสียงแล้ว' : 'ส่งคำตอบแล้ว')
      : (Recorder.supported ? (Recorder.speechToText ? 'พูดแล้วระบบจะถอดเป็นข้อความลงช่องด้านล่าง' : 'อัดเสียงได้ (เบราว์เซอร์นี้ถอดเสียงเป็นข้อความไม่ได้ ให้พิมพ์สิ่งที่พูดเพิ่มเติม)') : 'เบราว์เซอร์นี้อัดเสียงไม่ได้ ให้พิมพ์คำตอบแทน');
    updateWordCount();
  }

  function updateWordCount() {
    const q = curQ();
    if (!q || q.skill !== 'speaking') return;
    const n = (($('spText').value || '').match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g) || []).length;
    const c = $('spCount');
    c.textContent = `${n} คำ (แนะนำอย่างน้อย ${q.minWords} คำ)`;
    c.classList.toggle('ok', n >= q.minWords);
  }
  $('spText').addEventListener('input', () => {
    const s = S(); const q = curQ();
    if (E.isDone(s, q.id)) return;
    s.drafts[q.id] = $('spText').value;
    persist();
    updateWordCount();
  });
  $('spListenBtn').addEventListener('click', () => speakOnce([{ sp: 'N', text: curQ().prompt }]));

  $('spTimerBtn').addEventListener('click', () => {
    const q = curQ();
    if (practiceTimer) {
      clearInterval(practiceTimer.id); practiceTimer = null;
      $('spTimer').textContent = 'หยุดจับเวลาแล้ว';
      $('spTimerBtn').textContent = '⏱ เริ่มจับเวลาฝึก';
      return;
    }
    let phase = 'prep';
    let left = q.prepSeconds;
    const show = () => {
      $('spTimer').textContent = phase === 'prep' ? `เตรียมตัว: ${left} วินาที` : phase === 'speak' ? `พูดได้เลย: เหลือ ${left} วินาที` : 'หมดเวลา — ส่งคำตอบได้เลย';
      $('spTimer').className = 'sp-timer ' + phase;
    };
    show();
    $('spTimerBtn').textContent = '■ หยุดจับเวลา';
    practiceTimer = { id: setInterval(() => {
      left--;
      if (left <= 0 && phase === 'prep') { phase = 'speak'; left = q.responseSeconds; }
      else if (left <= 0 && phase === 'speak') {
        phase = 'done'; clearInterval(practiceTimer.id); practiceTimer = null; $('spTimerBtn').textContent = '⏱ เริ่มจับเวลาฝึก';
        if (recorder && recorder.state === 'recording') recorder.stop();
      }
      show();
    }, 1000) };
  });

  $('recBtn').addEventListener('click', async () => {
    const q = curQ();
    if (E.isDone(S(), q.id)) return;
    if (!Recorder.supported) { toast('เบราว์เซอร์นี้อัดเสียงไม่ได้ ใช้ Chrome หรือ Edge บนคอมพิวเตอร์ หรือพิมพ์คำตอบแทน', 3600); return; }
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    const base = $('spText').value.trim();
    const qid = q.id;
    if (recorder) recorder.dispose();
    recorder = new Recorder((r) => {
      if (curQ().id !== qid || E.isDone(S(), qid)) return;
      const btn = $('recBtn');
      if (r.state === 'recording') {
        btn.textContent = '■ หยุดอัดเสียง';
        btn.classList.add('recording');
        $('recStatus').textContent = `● กำลังอัด ${Math.floor(r.durationSec)} วินาที` + (Recorder.speechToText ? ` · ถอดได้ ${r.recognizedWords} คำ` : '');
        if (Recorder.speechToText && (r.transcript || r.interim)) {
          $('spText').value = (base ? base + ' ' : '') + r.transcript + (r.interim ? ' ' + r.interim : '');
          updateWordCount();
        }
      } else if (r.state === 'stopped') {
        btn.textContent = '🎙 อัดเสียงใหม่';
        btn.classList.remove('recording');
        if (Recorder.speechToText) {
          $('spText').value = ((base ? base + ' ' : '') + r.transcript).trim();
          S().drafts[qid] = $('spText').value; persist(); updateWordCount();
        }
        $('recStatus').textContent = `อัดเสียงแล้ว ${Math.round(r.durationSec)} วินาที — ฟังเสียงตัวเองได้ ตรวจข้อความ แล้วกดส่งคำตอบ`;
        if (r.url) { $('recAudio').src = r.url; $('recAudio').classList.remove('hidden'); }
      } else if (r.state === 'error') {
        btn.textContent = '🎙 เริ่มอัดเสียง';
        btn.classList.remove('recording');
        $('recStatus').textContent = r.error;
        toast(r.error, 4000);
      } else if (r.state === 'starting') {
        $('recStatus').textContent = 'กำลังขอสิทธิ์ใช้ไมโครโฟน...';
      }
    });
    await recorder.start();
  });

  $('spSubmit').addEventListener('click', () => {
    const s = S(); const q = curQ();
    if (E.isDone(s, q.id)) return;
    const text = $('spText').value.trim();
    const words = (text.match(/[A-Za-z]+/g) || []).length;
    if (words < 3) { toast('พิมพ์หรือพูดคำตอบเป็นภาษาอังกฤษอย่างน้อย 1 ประโยคก่อนส่ง'); $('spText').focus(); return; }
    const doSubmit = () => {
      let opts = {};
      if (recorder && recorder.state === 'recording') recorder.stop();
      if (recorder && recorder.durationSec >= 3) opts = { durationSec: recorder.durationSec, spokenWords: Recorder.speechToText ? recorder.recognizedWords : 0 };
      const rec = E.recordSpeaking(s, q, text, opts);
      if (!rec) return;
      if (recorder) { recorder.dispose(); }
      if (practiceTimer) { clearInterval(practiceTimer.id); practiceTimer = null; }
      persist();
      renderQuestion(); renderNavigator(); renderTop();
      const audioUrl = recorder && recorder.url;
      if (audioUrl) { $('recAudio').src = audioUrl; $('recAudio').classList.remove('hidden'); }
      recorder = null;
      setTimeout(() => $('feedback').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    if (words < q.minWords * 0.6) {
      openModal({
        title: 'คำตอบยังสั้นกว่าที่แนะนำ',
        body: `<p>คำตอบมี ${words} คำ ข้อนี้แนะนำอย่างน้อย ${q.minWords} คำ คำตอบสั้นจะได้คะแนนต่ำ และ<b>ส่งแล้วแก้ไขไม่ได้</b></p><p>ต้องการส่งเลย หรือกลับไปเพิ่มเนื้อหา?</p>`,
        okText: 'ส่งเลย', cancelText: 'กลับไปแก้ไข', onOk: () => { doSubmit(); return true; },
      });
    } else doSubmit();
  });

  // ------------------------------------------------------------------ feedback (multiple choice)
  function section(n, title, body, cls) {
    const sec = el('section', 'fb-sec ' + (cls || ''));
    sec.append(h('h3', 'fb-h', [el('span', 'fb-n', String(n)), title]));
    (Array.isArray(body) ? body : [body]).forEach((b) => b && sec.append(b));
    return sec;
  }
  const para = (t, cls) => el('p', 'fb-p ' + (cls || ''), t);

  function sayBtn(text, label) {
    const b = el('button', 'icon-btn', '🔊');
    b.type = 'button';
    b.title = label || 'ฟังการออกเสียง';
    b.setAttribute('aria-label', (label || 'ฟังการออกเสียง') + ': ' + text);
    b.addEventListener('click', () => speakOnce([{ sp: 'N', text }]));
    return b;
  }

  function vocabCards(list) {
    const grid = el('div', 'vocab-grid');
    list.forEach((v) => {
      const c = el('div', 'vcard');
      c.append(
        h('div', 'v-top', [h('span', 'v-word', v.word), h('span', 'v-pos', v.pos), sayBtn(v.word, 'ฟังคำศัพท์')]),
        h('div', 'v-ipa', v.ipa),
        h('div', 'v-th', '= ' + v.th),
        h('div', 'v-ex', [h('span', 'v-k', 'Example: '), '"' + v.example + '"']),
        h('div', 'v-col', [h('span', 'v-k', 'Business collocations: '), v.collocations.join(' · ')]),
      );
      grid.append(c);
    });
    return grid;
  }

  function mcqFeedback(q) {
    const s = S();
    const a = s.answers[q.id];
    const frag = document.createDocumentFragment();
    const st = E.statusOf(s, q);
    const correctTxt = `(${letter(q.answer)}) ${q.choices[q.answer]}`;
    const chosenTxt = a ? `(${letter(a.choice)}) ${q.choices[a.choice]}` : '-';

    const banner = el('div', 'fb-banner ' + st);
    banner.append(
      el('span', 'fb-result', st === 'correct' ? '✓ CORRECT' : st === 'incorrect' ? '✗ INCORRECT' : '— ไม่ได้ตอบ'),
      el('span', 'fb-chosen', a ? 'คำตอบที่คุณเลือก: ' + chosenTxt : 'ข้อนี้ไม่ได้ตอบก่อนจบการสอบ'),
    );
    frag.append(section(1, 'Result', banner, 'first'));
    frag.append(section(2, 'Correct Answer', para(correctTxt, 'answer-line')));
    frag.append(section(3, 'Why Correct?', para(q.why)));
    if (st === 'incorrect') frag.append(section(4, 'Why Your Answer Is Wrong?', [para(chosenTxt, 'answer-line wrong'), para(q.choiceNotes[a.choice].replace(/^ผิด\s*/, ''))]));
    else if (st === 'correct') frag.append(section(4, 'Why Your Answer Is Right', para('คุณเลือก ' + chosenTxt + ' ซึ่งถูกต้อง — ' + q.choiceNotes[q.answer].replace(/^ถูก\s*/, ''))));
    else frag.append(section(4, 'Why Your Answer Is Wrong?', para('ไม่ได้เลือกคำตอบ ลองอ่านเหตุผลของทุกตัวเลือกด้านล่าง')));

    const ul = el('ul', 'choice-reasons');
    q.choices.forEach((c, i) => {
      const right = i === q.answer;
      const li = el('li', 'reason ' + (right ? 'is-right' : 'is-wrong') + (a && a.choice === i ? ' is-chosen' : ''));
      const head = h('div', 'reason-head', [
        h('span', 'reason-icon', right ? '✓' : '✗'),
        h('span', 'reason-letter', `(${letter(i)})`),
        h('span', 'reason-choice', c),
      ]);
      if (a && a.choice === i) head.append(el('span', 'reason-you', 'คุณเลือก'));
      li.append(head, el('p', 'reason-why', q.choiceNotes[i]));
      ul.append(li);
    });
    frag.append(section(5, 'Why Other Choices Are Wrong?', [ul, h('div', 'trap', [h('b', '', 'จุดหลอกของข้อสอบ: '), q.trap])]));
    frag.append(section(6, 'Key Vocabulary', vocabCards(q.vocab)));
    frag.append(section(7, 'Grammar Point', [
      el('p', 'gp-title', q.grammar.title),
      para(q.grammar.explain),
      h('ul', 'ex-list', q.grammar.examples.map((x) => h('li', '', x))),
    ]));
    frag.append(section(8, 'Real Workplace Application', h('ul', 'work-list', q.workplace.map((w) => h('li', '', [
      h('span', 'w-en', w.en), sayBtn(w.en, 'ฟังประโยค'), h('span', 'w-th', w.th),
    ])))));
    frag.append(section(9, 'Exam Strategy', para(q.strategy), 'tip'));
    frag.append(section(10, 'What You Learned', para(q.learned), 'learned'));
    return frag;
  }

  // ------------------------------------------------------------------ feedback (speaking)
  const CRIT = [
    ['grammar', 'Grammar', 'ไวยากรณ์'],
    ['vocabulary', 'Vocabulary', 'คำศัพท์'],
    ['structure', 'Sentence Structure', 'โครงสร้างประโยค'],
    ['fluency', 'Fluency', 'ความคล่อง (จากเสียง)'],
    ['natural', 'Natural Communication', 'ความเป็นธรรมชาติ/ทำครบตามโจทย์'],
  ];
  function bar(v) {
    const t = el('div', 'bar-track');
    const f = el('div', 'bar-fill ' + (v >= 70 ? 'hi' : v >= 60 ? 'mid' : 'lo'));
    f.style.width = Math.max(0, Math.min(100, v)) + '%';
    t.append(f);
    return t;
  }

  function speakingFeedback(q) {
    const s = S();
    const sub = s.speaking[q.id];
    const frag = document.createDocumentFragment();
    if (!sub) {
      frag.append(section(1, 'Result', h('div', 'fb-banner unanswered', [el('span', 'fb-result', '— ไม่ได้ส่งคำตอบ'), el('span', 'fb-chosen', 'ดูคำตอบตัวอย่างด้านล่างแล้วลองฝึกพูดตาม')]), 'first'));
      frag.append(section(2, 'Sample Answer', [h('p', 'sample', [q.sample, ' ', sayBtn(q.sample, 'ฟังคำตอบตัวอย่าง')]), para(q.sampleNotes)]));
      frag.append(section(3, 'Useful Phrases', phraseList(q.usefulPhrases)));
      frag.append(section(4, 'Key Vocabulary', vocabCards(q.vocab)));
      frag.append(section(5, 'Exam Strategy', para(q.strategy), 'tip'));
      return frag;
    }
    const ev = sub.eval;
    const passed = ev.score >= E.PASS_SPEAKING;
    frag.append(section(1, 'Result', h('div', 'fb-banner ' + (passed ? 'correct' : 'incorrect'), [
      el('span', 'fb-result', `${passed ? '✓' : '✗'} ${ev.score}/100 · ${ev.level.en}`),
      el('span', 'fb-chosen', `${ev.level.th} · ${ev.wordCount} คำ · ${ev.sentences} ประโยค${sub.voice ? ' · มีการอัดเสียง' : ' · พิมพ์คำตอบ'}`),
    ]), 'first'));

    frag.append(section(2, 'Sample Answer', [h('p', 'sample', [q.sample, ' ', sayBtn(q.sample, 'ฟังคำตอบตัวอย่าง')]), para('ทำไมคำตอบนี้ดี: ' + q.sampleNotes)]));

    const yours = el('div', 'your-answer');
    yours.append(el('p', 'ya-label', 'คำตอบของคุณ'), el('p', 'ya-text', sub.text));
    const issues = el('ul', 'issue-list');
    if (ev.issues.length) ev.issues.forEach((i) => issues.append(h('li', '', [h('span', 'iss-found', `"${i.found}"`), ' → ', h('span', 'iss-fix', i.fix), h('span', 'iss-th', ' · ' + i.th)])));
    else issues.append(h('li', 'ok', '✓ ไม่พบข้อผิดพลาดไวยากรณ์ที่พบบ่อยของผู้เรียนไทย'));
    ev.tips.forEach((t) => issues.append(h('li', 'tip-li', '• ' + t)));
    frag.append(section(3, 'Your Answer & Grammar Check', [yours, issues]));

    const crit = el('div', 'crit');
    CRIT.forEach(([k, en, th]) => {
      const row = el('div', 'crit-row');
      const v = ev.criteria[k];
      row.append(h('span', 'crit-name', [h('b', '', en), h('small', '', th)]));
      if (v === undefined) {
        row.append(el('span', 'crit-na', 'ไม่ได้ประเมิน — ไม่มีการอัดเสียง (กด 🎙 อัดเสียงในข้อถัดไปเพื่อให้ประเมินได้)'));
      } else {
        row.append(bar(v), el('span', 'crit-val', v + ''));
      }
      crit.append(row);
    });
    const stats = el('p', 'crit-note', `คำศัพท์เป้าหมายที่ใช้: ${ev.keywordsUsed.length ? ev.keywordsUsed.join(', ') : '-'} · คำเชื่อมที่ใช้: ${ev.connectorsUsed.length ? ev.connectorsUsed.join(', ') : '-'}` + (ev.fluency ? ' · ' + ev.fluency.note : ''));
    frag.append(section(4, 'Evaluation: Grammar · Vocabulary · Structure · Fluency · Natural', [crit, stats]));

    const req = el('ul', 'req-list');
    ev.requiredHits.forEach((r) => req.append(h('li', r.ok ? 'ok' : 'miss', [r.ok ? '✓ ' : '✗ ', h('b', '', r.label), ` (${r.en})`])));
    frag.append(section(5, 'Task Checklist (สิ่งที่โจทย์ต้องการ)', req));

    frag.append(section(6, 'Useful Phrases', [phraseList(q.usefulPhrases),
      ev.keywordsMissing.length ? para('ลองใช้คำ/วลีเหล่านี้ครั้งหน้า: ' + ev.keywordsMissing.join(', '), 'muted') : null]));
    frag.append(section(7, 'Key Vocabulary', vocabCards(q.vocab)));
    frag.append(section(8, 'Common Mistakes', h('ul', 'mistakes', q.commonMistakes.map((m) => h('li', '', [
      h('span', 'm-wrong', '✗ ' + m.wrong), h('span', 'm-right', '✓ ' + m.right), h('span', 'm-th', m.th),
    ])))));
    frag.append(section(9, 'Exam Strategy', para(q.strategy), 'tip'));
    frag.append(section(10, 'What You Learned', [para(q.learned),
      para('หมายเหตุ: คะแนน Speaking ในระบบนี้ประเมินอัตโนมัติด้วยกฎภาษา (rule-based) เพื่อให้ feedback ทันที ไม่ใช่ผู้ตรวจ TOEIC Speaking จริง และไม่นำไปรวมกับคะแนน Listening & Reading', 'muted small')], 'learned'));
    return frag;
  }
  function phraseList(list) {
    return h('ul', 'work-list', list.map((p) => h('li', '', [h('span', 'w-en', p.en), sayBtn(p.en.replace(/\.\.\./g, ''), 'ฟังวลี'), h('span', 'w-th', p.th)])));
  }

  // ------------------------------------------------------------------ navigation buttons
  $('prevBtn').addEventListener('click', () => goTo(S().current - 1));
  $('nextBtn').addEventListener('click', () => {
    const s = S();
    if (s.current < s.ids.length - 1) goTo(s.current + 1);
    else finishFlow();
  });
  $('markBtn').addEventListener('click', toggleMark);
  function toggleMark() {
    const s = S(); const q = curQ();
    const i = s.marked.indexOf(q.id);
    if (i >= 0) s.marked.splice(i, 1); else s.marked.push(q.id);
    persist();
    renderQuestion(); renderNavigator();
    toast(i >= 0 ? `ยกเลิกเครื่องหมายทบทวนข้อ ${q.no}` : `ทำเครื่องหมายทบทวนข้อ ${q.no} (สีเหลืองใน Navigator)`);
  }
  $('finishBtn').addEventListener('click', finishFlow);
  $('restartBtn').addEventListener('click', () => {
    const s = S();
    const msg = s && !s.finished && E.answeredCount(s)
      ? `<p>ชุดปัจจุบันตอบไปแล้ว ${E.answeredCount(s)} ข้อ และยังไม่ได้จบการสอบ ถ้าเริ่มใหม่ <b>ความคืบหน้าของชุดนี้จะหายไป</b> (ประวัติการสอบที่จบแล้วยังอยู่)</p>`
      : '<p>เริ่มทำแบบทดสอบ 30 ข้อชุดใหม่ ประวัติการสอบที่จบแล้วยังเก็บไว้</p>';
    openModal({
      title: 'เริ่มทำชุดใหม่?', body: msg, okText: 'เริ่มชุดใหม่', okClass: 'btn-danger', cancelText: 'ยกเลิก',
      onOk: () => { setTimeout(() => startDialog(true), 30); return true; },
    });
  });
  $('editNameBtn').addEventListener('click', () => {
    const wrap = el('div');
    wrap.innerHTML = '<label for="nameEdit">ชื่อผู้ทำแบบทดสอบ</label><input type="text" id="nameEdit" maxlength="40" autocomplete="off">';
    openModal({
      title: 'แก้ไขชื่อ', body: wrap, okText: 'บันทึก', cancelText: 'ยกเลิก', focus: 'nameEdit',
      onOk: () => { const v = $('nameEdit').value.trim(); if (v) { state.name = v; S().name = v; persist(); renderTop(); } return true; },
    });
    $('nameEdit').value = S().name || '';
  });

  function finishFlow() {
    const s = S();
    if (s.finished) { stopAll(); s.view = 'result'; persist(); render(); window.scrollTo(0, 0); return; }
    const left = s.ids.length - E.answeredCount(s);
    const body = left
      ? `<p>ยังมี <b>${left} ข้อ</b>ที่ยังไม่ได้ทำ ข้อที่ไม่ได้ทำจะนับเป็น "ยังไม่ตอบ" ในการวิเคราะห์</p><p>หลังจบการสอบจะตอบเพิ่มไม่ได้ แต่กลับไปอ่านเฉลยและคำอธิบายทุกข้อได้</p>`
      : '<p>ทำครบ 30 ข้อแล้ว ระบบจะสรุปผลแยกตามทักษะ (Listening / Reading / Speaking) พร้อมคำแนะนำการเรียน</p>';
    openModal({
      title: left ? 'จบการสอบทั้งที่ยังทำไม่ครบ?' : 'จบการสอบและดูผลวิเคราะห์', body,
      okText: 'จบการสอบ', cancelText: left ? 'กลับไปทำต่อ' : 'ยกเลิก',
      onOk: () => { finalize(); return true; },
    });
  }

  function finalize() {
    const s = S();
    if (s.finished) return;
    stopAll();
    s.finished = true;
    s.finishedAt = Date.now();
    s.view = 'result';
    const res = E.analyze(s, bank);
    state.history = E.upsertHistory(state.history, s, res).list;
    persist();
    render();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ result / analytics
  function renderResult() {
    const s = S();
    const res = E.analyze(s, bank);
    const view = $('resultView');
    view.replaceChildren();
    const card = el('div', 'result-card');
    view.append(card);

    card.append(el('p', 'q-counter', 'FOUNDATION ASSESSMENT REPORT'));
    const head = el('div', 'result-head');
    const ring = el('div', 'score-ring');
    ring.style.setProperty('--pct', res.lr.pct);
    ring.append(h('div', 'score-ring-inner', [h('span', 'score-pct', Math.round(res.lr.pct) + '%'), h('span', 'score-sub', `L&R ${res.lr.correct}/${res.lr.total} ข้อ`)]));
    const sum = el('div', 'result-summary');
    sum.append(
      el('h2', 'result-title', `ผลการทำแบบทดสอบของ ${s.name || 'ผู้เรียน'}`),
      el('p', 'result-msg', res.lr.pct >= 80 ? 'พื้นฐานแน่นมาก พร้อมขยับไปฝึกข้อสอบระดับกลางและจับเวลาเหมือนสอบจริง'
        : res.lr.pct >= 60 ? 'พื้นฐานดี ยังมีบางจุดที่ต้องเก็บ ดูคำแนะนำด้านล่างเพื่อวางแผนฝึก'
          : 'เริ่มต้นได้ดี ทุกข้อที่ผิดคือบทเรียน ทบทวนตามคำแนะนำด้านล่างทีละหัวข้อ'),
    );
    const stats = el('ul', 'result-stats');
    const stat = (label, val, cls) => h('li', cls || '', [label + ' ', h('b', '', val)]);
    stats.append(
      stat('ถูก', `${res.lr.correct} ข้อ`, 'ok'),
      stat('ผิด', `${res.lr.wrong} ข้อ`, 'bad'),
      stat('ไม่ได้ตอบ', `${res.lr.unanswered} ข้อ`),
      stat('Accuracy (L&R)', `${res.lr.pct}%`),
      stat('เวลาที่ใช้', E.formatDuration(res.timeMs)),
    );
    sum.append(stats);
    const spBox = h('div', 'sp-summary', [
      h('span', 'sp-k', 'Speaking (แยกจาก L&R)'),
      h('b', '', `${res.skills.speaking.score}/100`),
      h('span', '', ` · ส่งแล้ว ${res.speaking.submitted}/12 · ผ่านเกณฑ์ ${res.speaking.passed} ข้อ · เฉลี่ยของข้อที่ส่ง ${res.speaking.avg}/100`),
    ]);
    sum.append(spBox);
    head.append(ring, sum);
    card.append(head);
    card.append(h('div', 'notice', [h('b', '', 'สำคัญ: '), bank.disclaimer + ' — Listening & Reading (เต็ม 990 ในการสอบจริง) และ Speaking (เต็ม 200 ในการสอบจริง) เป็นการสอบแยกกัน ระบบนี้จึงรายงานแยกและไม่รวมคะแนนเข้าด้วยกัน']));

    // Skill analysis
    card.append(el('h3', 'section-title', 'Skill Analysis — แยกตามทักษะและสัดส่วนข้อสอบ'));
    const skills = el('div', 'skill-cards');
    for (const sk of E.SKILLS) {
      const r = res.skills[sk];
      const val = sk === 'speaking' ? r.score : r.pct;
      const c = el('div', 'skill-card ' + sk);
      c.append(
        h('div', 'sc-top', [h('span', 'sc-name', `${SKILL_LABEL[sk]} Performance`), h('span', 'sc-weight', `${bank.skills[sk].weight}% · ${r.total} ข้อ`)]),
        h('div', 'sc-val', sk === 'speaking' ? `${val}/100` : `${val}%`),
        bar(val),
        el('p', 'sc-detail', sk === 'speaking'
          ? `ผ่านเกณฑ์ (≥${E.PASS_SPEAKING}) ${res.speaking.passed} · ควรฝึกเพิ่ม ${r.wrong} · ยังไม่ส่ง ${r.unanswered}`
          : `ถูก ${r.correct} · ผิด ${r.wrong} · ไม่ได้ตอบ ${r.unanswered}`),
      );
      skills.append(c);
    }
    card.append(skills);

    // Parts table
    card.append(el('h3', 'section-title', 'ผลรายพาร์ต'));
    const tw = el('div', 'topic-table-wrap');
    const tb = el('table', 'topic-table parts');
    tb.innerHTML = '<thead><tr><th>ทักษะ</th><th>พาร์ต / หมวด</th><th>ถูก/ผ่าน</th><th>ทั้งหมด</th><th>%</th></tr></thead>';
    const body = el('tbody');
    Object.entries(bank.parts).forEach(([k, p]) => {
      const r = res.parts[k];
      if (!r) return;
      const tr = el('tr');
      tr.append(el('td', 'sk-' + p.skill, SKILL_LABEL[p.skill]), el('td', '', p.label), el('td', '', r.correct), el('td', '', r.total),
        el('td', r.pct < 50 ? 'low' : r.pct >= 80 ? 'high' : '', r.pct + '%'));
      body.append(tr);
    });
    tb.append(body); tw.append(tb); card.append(tw);

    // Knowledge analysis
    card.append(el('h3', 'section-title', 'Knowledge Analysis — จุดอ่อนที่ควรเสริม'));
    const kn = el('div', 'know-grid');
    const KN = [
      ['grammar', 'Grammar Weakness', res.speaking.criteria.grammar],
      ['vocabulary', 'Vocabulary Weakness', res.speaking.criteria.vocabulary],
      ['listening', 'Listening Weakness', null],
      ['reading', 'Reading Comprehension Weakness', null],
    ];
    for (const [k, title, spVal] of KN) {
      const r = res.knowledge[k];
      const c = el('div', 'know-card');
      c.append(h('div', 'kc-top', [h('b', '', title), h('span', 'kc-pct ' + (r.pct < 60 ? 'low' : 'high'), `${r.correct}/${r.total} · ${r.pct}%`)]));
      if (spVal !== undefined && spVal !== null) c.append(el('p', 'kc-sp', `คะแนน ${k === 'grammar' ? 'Grammar' : 'Vocabulary'} เฉลี่ยจาก Speaking: ${spVal}/100`));
      const ul = el('ul', 'kc-list');
      if (r.wrongTopics.length) r.wrongTopics.forEach((t) => {
        const li = el('li');
        li.append(gotoBtn(t.no), document.createTextNode(' ' + t.topic + (t.status === 'unanswered' ? ' (ไม่ได้ตอบ)' : '')));
        ul.append(li);
      });
      else ul.append(el('li', 'ok', '✓ ไม่มีจุดอ่อนในหมวดนี้จากชุดนี้'));
      c.append(ul);
      kn.append(c);
    }
    card.append(kn);

    // Speaking criteria
    if (res.speaking.submitted) {
      card.append(el('h3', 'section-title', 'Speaking Criteria (เฉลี่ยจากข้อที่ส่ง)'));
      const crit = el('div', 'crit');
      CRIT.forEach(([k, en, th]) => {
        const row = el('div', 'crit-row');
        row.append(h('span', 'crit-name', [h('b', '', en), h('small', '', th)]));
        const v = res.speaking.criteria[k];
        if (v === undefined) row.append(el('span', 'crit-na', 'ไม่ได้ประเมิน — ยังไม่มีคำตอบที่อัดเสียง'));
        else row.append(bar(v), el('span', 'crit-val', v + ''));
        crit.append(row);
      });
      card.append(crit);
    }

    // Recommendations
    const rec = res.recommendations;
    card.append(el('h3', 'section-title', 'Learning Recommendations — แผนการเรียน'));
    const rg = el('div', 'rec-grid');
    const recCard = (title, content) => { const c = el('div', 'rec-card'); c.append(el('h4', '', title), content); rg.append(c); return c; };
    const reviewUl = el('ul', 'rec-list');
    if (rec.review.length) rec.review.forEach((r) => { const li = el('li'); li.append(gotoBtn(r.no), document.createTextNode(' ' + r.topic)); reviewUl.append(li); });
    else reviewUl.append(el('li', 'ok', '✓ ไม่มีข้อที่ต้องทบทวน'));
    recCard('เรื่องที่ควรกลับไปทบทวน', reviewUl);
    const vUl = el('ul', 'rec-list vocab-list');
    if (rec.vocab.length) rec.vocab.forEach((v) => vUl.append(h('li', '', [h('b', '', v.word), ` (${v.pos}) = ${v.th}`, h('span', 'muted', ` · ข้อ ${v.no}`)])));
    else vUl.append(el('li', 'ok', '✓ คำศัพท์ในชุดนี้เข้าใจดี'));
    recCard('คำศัพท์ที่ยังไม่เข้าใจ', vUl);
    const gUl = el('ul', 'rec-list');
    if (rec.grammar.length) rec.grammar.forEach((g) => gUl.append(h('li', '', [g.no ? gotoBtn(g.no) : null, ' ' + g.title + (g.count ? ` (${g.count} ครั้ง)` : '')])));
    else gUl.append(el('li', 'ok', '✓ ไม่พบ Grammar ที่ผิดซ้ำ'));
    recCard('Grammar ที่ยังผิดบ่อย', gUl);
    recCard('ทักษะที่ต้องเพิ่มเวลาในการฝึก', h('div', '', [
      el('p', 'fb-p', rec.focus),
      h('ol', 'rec-list', rec.skillOrder.map((sk) => h('li', '', `${SKILL_LABEL[sk]}: ${sk === 'speaking' ? res.skills.speaking.score + '/100' : res.skills[sk].pct + '%'}`))),
    ]));
    const plan = recCard('แนวทางการเรียนในวันถัดไป', h('ol', 'rec-list', rec.plan.map((p) => h('li', '', p))));
    plan.classList.add('wide');
    card.append(rg);

    // History
    if (state.history.length) {
      card.append(el('h3', 'section-title', 'ประวัติการสอบ (บันทึกในเบราว์เซอร์นี้)'));
      const hw = el('div', 'topic-table-wrap');
      const ht = el('table', 'topic-table');
      ht.innerHTML = '<thead><tr><th>วันที่</th><th>ชื่อ</th><th>L&R</th><th>Listening</th><th>Reading</th><th>Speaking</th><th>เวลา</th></tr></thead>';
      const hb = el('tbody');
      state.history.forEach((x) => {
        const tr = el('tr', x.attemptId === s.attemptId ? 'cur' : '');
        tr.append(el('td', '', new Date(x.finishedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })), el('td', '', x.name || '-'),
          el('td', '', `${x.lr.correct}/${x.lr.total} (${x.lr.pct}%)`), el('td', '', x.listening + '%'), el('td', '', x.reading + '%'),
          el('td', '', x.speaking + '/100'), el('td', '', E.formatDuration(x.timeMs)));
        hb.append(tr);
      });
      ht.append(hb); hw.append(ht); card.append(hw);
    }

    const actions = el('div', 'result-actions');
    const btn = (id, cls, text, fn) => { const b = el('button', 'btn ' + cls, text); b.type = 'button'; b.id = id; b.addEventListener('click', fn); actions.append(b); };
    btn('reviewAllBtn', 'btn-primary', 'ดูเฉลยและคำอธิบายรายข้อ', () => goTo(0));
    btn('reviewWrongBtn', 'btn-outline', 'ทบทวนข้อที่ผิด/ยังไม่ทำ', () => {
      const i = s.ids.findIndex((id) => E.statusOf(s, byId[id]) !== 'correct');
      if (i < 0) { toast('ไม่มีข้อที่ผิดหรือยังไม่ทำ เยี่ยมมาก!'); return; }
      goTo(i);
    });
    btn('printBtn', 'btn-ghost', 'พิมพ์ / บันทึกรายงานเป็น PDF', () => window.print());
    btn('newAttemptBtn', 'btn-ghost', 'เริ่มทำชุดใหม่', () => $('restartBtn').click());
    card.append(actions);
  }

  function gotoBtn(no) {
    const b = el('button', 'goto', 'ข้อ ' + no);
    b.type = 'button';
    b.dataset.goto = no;
    b.addEventListener('click', () => goTo(bank.questions.findIndex((q) => q.no === no)));
    return b;
  }

  // ------------------------------------------------------------------ keyboard
  document.addEventListener('keydown', (e) => {
    if (!S() || !$('modal').classList.contains('hidden')) {
      if (e.key === 'Escape' && !$('modalCancel').classList.contains('hidden')) $('modalCancel').click();
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (S().view === 'result') return;
    const q = curQ();
    const k = e.key.toLowerCase();
    if (k === 'arrowright') { e.preventDefault(); $('nextBtn').click(); }
    else if (k === 'arrowleft') { if (S().current > 0) { e.preventDefault(); goTo(S().current - 1); } }
    else if (k === 'm') toggleMark();
    else if (k === 'p' && q.skill === 'listening') playCurrent(false);
    else if (q.skill !== 'speaking') {
      const map = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
      if (k in map && map[k] < q.choices.length) choose(map[k]);
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  window.addEventListener('beforeunload', () => { if (S()) persist(); });

  // test hook (used by tests/e2e.test.cjs)
  window.__quest = {
    getState: () => JSON.parse(JSON.stringify(state)),
    analyze: () => (S() ? E.analyze(S(), bank) : null),
    bank: () => bank,
  };

  boot();
}());
