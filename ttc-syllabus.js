window.__ttcIc=window.__ttcIc||function(n){var P={lock:'<rect fill="currentColor" fill-opacity=".2" x="4.5" y="10.5" width="15" height="10.5" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',pencil:'<path fill="currentColor" fill-opacity=".2" d="M16 3l5 5L8 21H3v-5z"/><path d="M13.5 5.5l5 5"/>',book:'<path fill="currentColor" fill-opacity=".2" d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M8 7h8M8 11h5M4 21.5h16"/>',info:'<circle fill="currentColor" fill-opacity=".2" cx="12" cy="12" r="9.5"/><path d="M12 11v5M12 7.500v.1"/>',check:'<circle fill="currentColor" fill-opacity=".2" cx="12" cy="12" r="9.5"/><path d="M7.500 12.500l3 3 6-6.500"/>',clock:'<circle fill="currentColor" fill-opacity=".2" cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',bell:'<path fill="currentColor" fill-opacity=".2" d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'};return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+(P[n]||'')+'</svg>';};
/* ═══════════════════════════════════════════════════════════
   TTC Parent Dashboard — Syllabus editing for parents / students   (v3 · master-panel look)
   Add subject · add chapters · set Completed / Ongoing / Upcoming · remove own chapter
   Self-contained add-on (replaces populateSyllabus). Loaded with ONE line in index.html.
   Rules (also enforced by the server):
     • a chapter a TEACHER marked Completed is locked 🔒 (Upcoming and Ongoing can be changed)
     • you can remove only chapters you added yourself
   Also shows a small "TTC PD update" pop-up — at most 5 times per device, and never again once it was used.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof populateSyllabus !== 'function') return;     // wrong page → do nothing

  var inflight = 0, refreshTimer = null, pickKey = null, openNext = null;
  var NOTE_KEY = 'ttc_syl_notice_n', NOTE_MAX = 5, TIP_KEY = 'ttc_syl_tip_done';
  var noteShownThisLoad = false;
  var SUGGEST = ['Maths', 'Science', 'English', 'Hindi', 'Marathi', 'Social Science', 'EVS', 'Computer', 'GK'];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  // ── styles: same language as the Command Center (slate + white, 1px borders, soft cards, segmented control, rust button) ──
  var css = [
    '.sx{--b:#E2E8F0;--dk:#0F172A;--gr:#64748B;--lt:#F1F5F9;--of:#F8FAFC;--bl:#4361EE;--ru:#D94F2B;--gn:#10B981;--or:#FF6B35;font-family:"DM Sans",sans-serif}',
    '@keyframes sxFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    // helper tip + add-subject button
    '.sx-tip{display:flex;gap:8px;align-items:flex-start;background:#EEF2FF;border:1px solid #C7D2FE;color:#3730A3;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:700;line-height:1.4;margin-bottom:12px}',
    '.sx-add-subject{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;background:var(--of);color:var(--bl);border:2px dashed rgba(67,97,238,.4);border-radius:12px;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:14px;transition:.15s}',
    '.sx-add-subject:active{background:#E0E7FF;border-color:var(--bl)}',
    // subject card interior
    '.sx .syl-body{padding:12px;background:var(--of)}',
    '.sx-prog{font-size:11px;font-weight:800;color:var(--gr);background:var(--lt);border:1px solid var(--b);padding:3px 8px;border-radius:50px;white-space:nowrap}',
    // chapter = a clean card
    '.sx .syl-chapter{display:block;padding:0;margin-bottom:8px;background:#fff;border:1px solid var(--b);border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,.02);font-size:14px;overflow:hidden;transition:.15s}',
    '.sx .syl-chapter:last-child{border-bottom:1px solid var(--b)}',
    '.sx .syl-chapter.open{border-color:#C7D2FE;box-shadow:0 0 0 2px rgba(67,97,238,.10)}',
    '.sx-row{display:flex;align-items:center;gap:10px;padding:12px;min-height:50px;cursor:pointer}',
    '.sx-row.locked{cursor:default}',
    '.sx-row:active{background:var(--of)}',
    '.sx .syl-chapter .chk{width:26px;height:26px;font-size:13px}',
    '.sx-main{flex:1;min-width:0}',
    '.sx-main .cname{flex:none;font-size:14px;font-weight:700;line-height:1.3;word-break:break-word}',
    '.sx-meta{font-size:10px;font-weight:800;margin-top:3px;color:var(--gr)}',
    '.sx-meta.me{color:var(--bl)}',
    '.sx-chev{color:var(--gr);font-size:12px;flex-shrink:0}',
    '.sx-del{width:28px;height:28px;border-radius:10px;background:#FEE2E2;color:#EF4444;border:1.5px solid #FCA5A5;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;cursor:pointer;flex-shrink:0;padding:0}',
    // the 3-choice segmented control (same as the Command Center)
    '.sx-seg{display:flex;background:var(--lt);padding:4px;border-radius:10px;gap:4px;margin:0 12px 12px;animation:sxFade .18s ease}',
    '.sx-seg button{flex:1;border:none;background:transparent;padding:10px 0;border-radius:8px;font-family:inherit;font-size:13px;font-weight:700;color:var(--gr);cursor:pointer}',
    '.sx-seg button.on{background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.06);color:var(--dk)}',
    '.sx-seg button.on.c{color:var(--gn)}',
    '.sx-seg button.on.o{color:var(--or)}',
    // inputs + buttons
    '.sx-in{width:100%;box-sizing:border-box;padding:12px 14px;font-family:inherit;font-size:14px;font-weight:600;border:1.5px solid var(--b);border-radius:12px;background:#fff;color:var(--dk);outline:none;transition:.15s}',
    '.sx-in:focus{border-color:var(--bl);box-shadow:0 0 0 3px rgba(67,97,238,.1)}',
    '.sx-in.bad{border-color:#EF4444;box-shadow:0 0 0 3px rgba(239,68,68,.1)}',
    '.sx-addch{display:flex;gap:8px;margin-top:12px}',
    '.sx-addch .sx-in{flex:1;width:auto}',
    '.sx-btn{background:var(--ru);color:#fff;border:none;border-radius:12px;padding:12px 18px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(217,79,43,.2);white-space:nowrap;transition:.15s}',
    '.sx-btn:active{transform:scale(.96)}',
    '.sx-sec{background:var(--lt);color:var(--dk);border:none;border-radius:12px;padding:12px 18px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}',
    // pop-ups (add subject + update notice)
    '.sx-modal{display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10000;align-items:center;justify-content:center;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);padding:20px}',
    '.sx-modal.show{display:flex}',
    '.sx-box{background:#fff;padding:22px;border-radius:20px;border:1px solid var(--b);width:100%;max-width:380px;max-height:88vh;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,.12);animation:sxFade .2s ease;color:var(--dk)}',
    '.sx-title{font-size:18px;font-weight:800;margin-bottom:16px}',
    '.sx-fld{margin-bottom:16px}',
    '.sx-lab{display:block;font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--gr);margin-bottom:6px}',
    '.sx-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
    '.sx-chip{padding:7px 12px;font-family:inherit;font-size:12px;font-weight:700;background:#fff;border:1px solid var(--b);border-radius:50px;color:var(--gr);cursor:pointer}',
    '.sx-chip:active{transform:scale(.96)}',
    '.sx-chip.on{background:var(--dk);color:#fff;border-color:var(--dk)}',
    '.sx-crow{display:flex;gap:8px;margin-bottom:8px}',
    '.sx-crow .sx-in{flex:1;width:auto}',
    '.sx-rm{width:46px;border-radius:12px;background:#FEE2E2;color:#EF4444;border:1.5px solid #FCA5A5;font-weight:800;cursor:pointer;flex-shrink:0}',
    '.sx-more{width:100%;background:var(--of);color:var(--bl);border:2px dashed rgba(67,97,238,.4);border-radius:12px;padding:11px;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer}',
    '.sx-more:active{background:#E0E7FF;border-color:var(--bl)}',
    '.sx-actions{display:flex;gap:10px;margin-top:6px}',
    '.sx-actions .sx-sec{flex:1}',
    '.sx-actions .sx-btn{flex:1.4}',
    '.sx-err{color:#EF4444;font-size:12px;font-weight:700;margin-top:6px;min-height:14px}',
    '.sx-note{text-align:center}',
    '.sx-note-ic{width:56px;height:56px;border-radius:18px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px}',
    '.sx-note p{font-size:14px;font-weight:600;color:var(--gr);line-height:1.5;margin:0 0 18px}',
    // toast
    '#sylToast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);max-width:86%;background:#0F172A;color:#fff;font-family:"DM Sans",sans-serif;font-size:13px;font-weight:700;padding:11px 16px;border-radius:12px;z-index:10001;display:none;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.2)}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ── tiny helpers ──
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('sylToast');
    if (!t) { t = document.createElement('div'); t.id = 'sylToast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  function post(payload) {
    return fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify([payload])
    }).then(function (r) { return r.json(); });
  }

  // ── the "TTC PD update" pop-up: max 5 times per device, then never again (also stops once the feature is used) ──
  function noteCount() { return parseInt(lsGet(NOTE_KEY) || '0', 10) || 0; }
  function noteDone() { lsSet(NOTE_KEY, String(NOTE_MAX)); }
  var noticeEl = null;
  function showNotice() {
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.className = 'sx sx-modal'; noticeEl.id = 'sxNotice';
      noticeEl.innerHTML =
        '<div class="sx-box sx-note">' +
          '<div class="sx-note-ic">' + window.__ttcIc('book') + '</div>' +
          '<div class="sx-title" style="margin-bottom:8px">TTC PD update</div>' +
          '<p>Now students can change, mark and add syllabus by themselves in the Syllabus section.</p>' +
          '<div class="sx-actions"><button type="button" class="sx-sec" data-sx="note-ok">Got it</button>' +
          '<button type="button" class="sx-btn" data-sx="note-go">Open Syllabus</button></div>' +
        '</div>';
      document.body.appendChild(noticeEl);
      noticeEl.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-sx]') : null;
        if (b && b.getAttribute('data-sx') === 'note-go') { noteDone(); noticeEl.classList.remove('show'); if (typeof goToTab === 'function') goToTab('syllabus'); }
        else if ((b && b.getAttribute('data-sx') === 'note-ok') || e.target === noticeEl) noticeEl.classList.remove('show');
      });
    }
    noticeEl.classList.add('show');
  }
  function maybeNotice() {
    if (noteShownThisLoad || noteCount() >= NOTE_MAX) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    noteShownThisLoad = true;                               // at most once per app opening…
    lsSet(NOTE_KEY, String(noteCount() + 1));               // …and at most 5 openings in total
    showNotice();
  }

  // ── local (instant) edits, mirrored on the server ──
  function sdata() {
    var s = currentStudent;
    if (!s) return null;
    if (!s.syllabus) s.syllabus = {};
    if (!s.sylMeta) s.sylMeta = {};
    return s;
  }
  function findSubject(s, name) {
    var low = String(name).toLowerCase();
    for (var k in s.syllabus) { if (s.syllabus.hasOwnProperty(k) && String(k).toLowerCase() === low) return k; }
    return null;
  }
  function drop(arr, v) { var i = arr.indexOf(v); if (i !== -1) arr.splice(i, 1); }

  // the parent's OWN completions must not light the red "new" dot
  function markSeen(subj, chap) {
    try {
      var cleanName = String(subj || 'General').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
      var key = currentStudentId + '_syl_' + safeId(cleanName);
      var saved = [], raw = localStorage.getItem(key);
      if (raw) { var p = JSON.parse(raw); saved = Array.isArray(p) ? p : (p && Array.isArray(p.completed) ? p.completed : []); }
      if (saved.indexOf(chap) === -1) saved.push(chap);
      localStorage.setItem(key, JSON.stringify(saved));
    } catch (e) { }
  }
  function localSet(subj, chap, to) {
    var s = sdata(); var d = s && s.syllabus[subj]; if (!d) return;
    d.completed = d.completed || []; d.ongoing = d.ongoing || []; d.pending = d.pending || [];
    drop(d.completed, chap); drop(d.ongoing, chap); drop(d.pending, chap);
    (to === 'Completed' ? d.completed : (to === 'Ongoing' ? d.ongoing : d.pending)).push(chap);
    var m = (s.sylMeta[subj] = s.sylMeta[subj] || {});
    m[chap] = { p: 1, n: (m[chap] && m[chap].n) ? 1 : 0 };
    if (to === 'Completed') markSeen(subj, chap);
  }
  function localAdd(subjIn, chaps) {
    var s = sdata();
    var subj = findSubject(s, subjIn) || subjIn;
    if (!s.syllabus[subj]) s.syllabus[subj] = { completed: [], ongoing: [], pending: [] };
    var d = s.syllabus[subj]; d.completed = d.completed || []; d.ongoing = d.ongoing || []; d.pending = d.pending || [];
    var m = (s.sylMeta[subj] = s.sylMeta[subj] || {});
    chaps.forEach(function (c) {
      var exists = d.completed.concat(d.ongoing, d.pending).some(function (x) { return String(x).toLowerCase() === c.toLowerCase(); });
      if (exists) return;
      d.pending.push(c); m[c] = { p: 1, n: 1 };
    });
    return subj;
  }
  function localRemove(subj, chap) {
    var s = sdata(); var d = s && s.syllabus[subj]; if (!d) return;
    drop(d.completed || [], chap); drop(d.ongoing || [], chap); drop(d.pending || [], chap);
    if (s.sylMeta[subj]) delete s.sylMeta[subj][chap];
    if (!(d.completed || []).length && !(d.ongoing || []).length && !(d.pending || []).length) { delete s.syllabus[subj]; delete s.sylMeta[subj]; }
  }

  // ── rendering ──
  function render(s, force) {
    var container = document.getElementById('syllabusList');
    if (!container) return;
    container.classList.add('sx');
    if (!force) {                                           // the 30s auto-reload must never interrupt typing
      var a = document.activeElement;
      if (a && a.classList && a.classList.contains('syl-in')) return;
    }

    // remember what the parent was doing
    var open = {}, vals = {};
    Array.prototype.forEach.call(container.querySelectorAll('.syllabus-subject.open'), function (el) { open[el.getAttribute('data-name')] = 1; });
    Array.prototype.forEach.call(container.querySelectorAll('.syl-in'), function (el) { if (el.value) vals[el.getAttribute('data-s')] = el.value; });
    if (openNext) { open[openNext] = 1; openNext = null; }

    var html = '';
    if (!lsGet(TIP_KEY)) html += '<div class="sx-tip"><span>' + window.__ttcIc('info') + '</span><span>Tap any chapter to set it to Upcoming, Ongoing or Completed.</span></div>';
    html += '<button type="button" class="sx-add-subject" id="sxAddBtn">＋ Add a subject</button>';

    var index = 0, any = false;
    var syl = (s && s.syllabus) || {};
    var meta = (s && s.sylMeta) || {};

    for (var subj in syl) {
      if (!syl.hasOwnProperty(subj)) continue;
      var data = syl[subj]; if (!data) continue;
      any = true;

      var cleanName = String(subj || 'General').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
      var comp = data.completed || [], ongo = data.ongoing || [], pend = data.pending || [];

      // red "new completed chapter" dot — unchanged logic
      var sKey = 'syl_' + safeId(cleanName);
      var savedComp = [];
      try {
        var savedStr = localStorage.getItem(currentStudentId + '_' + sKey);
        if (savedStr) {
          var parsed = JSON.parse(savedStr);
          if (Array.isArray(parsed)) savedComp = parsed;
          else if (parsed && Array.isArray(parsed.completed)) savedComp = parsed.completed;
        }
      } catch (e) { }
      var isNew = false;
      for (var c = 0; c < comp.length; c++) { if (savedComp.indexOf(comp[c]) === -1) { isNew = true; break; } }

      var sm = meta[subj] || {};
      var total = comp.length + ongo.length + pend.length;
      var chapterRow = function (chapName, kind) {
        var m = sm[chapName] || { p: 0, n: 0 };
        var locked = (kind === 'done') && !m.p;              // only a teacher-confirmed Completed is locked
        var isOpen = (pickKey === subj + '\u0001' + chapName);
        var at = ' data-s="' + esc(subj) + '" data-c="' + esc(chapName) + '"';
        var chk, tag, nameCls;
        if (kind === 'done') {
          chk = '<div class="chk done">✓</div>'; nameCls = 'done';
          tag = '<div class="ctag done">Completed</div>';
        } else if (kind === 'ongoing') {
          chk = '<div class="chk" style="background:#FFF3E0; border-color:#FF6B35; color:#FF6B35;">↻</div>'; nameCls = '';
          tag = '<div class="ctag" style="background:#FFF3E0; color:#FF6B35; border: 1.5px solid #FF6B35;">Ongoing</div>';
        } else {
          chk = '<div class="chk pending">○</div>'; nameCls = 'pending';
          tag = '<div class="ctag pending">Upcoming</div>';
        }
        var metaLine = locked ? '<div class="sx-meta">' + window.__ttcIc('lock') + ' Marked by your teacher</div>' : (m.p ? '<div class="sx-meta me">' + window.__ttcIc('pencil') + ' Updated by you</div>' : '');
        var del = m.n ? '<button type="button" class="sx-del" data-act="del"' + at + ' title="Remove">✕</button>' : '';
        var chev = locked ? '' : '<span class="sx-chev">' + (isOpen ? '▴' : '▾') + '</span>';
        var h = '<div class="syl-chapter' + (isOpen ? ' open' : '') + '">' +
          '<div class="sx-row' + (locked ? ' locked' : '') + '" data-act="' + (locked ? 'locked' : 'menu') + '"' + at + '>' +
            chk + '<div class="sx-main"><div class="cname ' + nameCls + '">' + esc(chapName) + '</div>' + metaLine + '</div>' + tag + del + chev +
          '</div>';
        if (isOpen) {
          var cur = kind === 'done' ? 'Completed' : (kind === 'ongoing' ? 'Ongoing' : 'Pending');
          h += '<div class="sx-seg">' + [['Completed', 'Completed', 'c'], ['Ongoing', 'Ongoing', 'o'], ['Pending', 'Upcoming', 'u']].map(function (o) {
            return '<button type="button" class="' + o[2] + (o[0] === cur ? ' on' : '') + '" data-act="pick" data-to="' + o[0] + '"' + at + '>' + o[1] + '</button>';
          }).join('') + '</div>';
        }
        return h + '</div>';
      };

      html += '<div class="syllabus-subject' + (open[subj] ? ' open' : '') + '" id="syl' + index + '" data-name="' + esc(subj) + '">';
      html += '<div class="syl-header" onclick="toggleSyllabus(' + index + ', \'' + sKey + '\', \'' + safeStrObj(comp) + '\')">';
      html += '<div class="syl-icon">' + window.__ttcIc('book') + '</div>';
      html += '<div class="syl-name" style="display:flex; align-items:center;">' + cleanName + '<div class="inner-dot ' + (isNew ? 'active' : '') + '" id="dot_' + sKey + '"></div></div>';
      html += '<span class="sx-prog">' + comp.length + '/' + total + '</span>';
      html += '<div class="syl-expand">▼</div></div><div class="syl-body">';
      comp.forEach(function (x) { html += chapterRow(x, 'done'); });
      ongo.forEach(function (x) { html += chapterRow(x, 'ongoing'); });
      pend.forEach(function (x) { html += chapterRow(x, 'pending'); });
      html += '<div class="sx-addch"><input class="syl-in sx-in" type="text" data-s="' + esc(subj) + '" maxlength="80" placeholder="Add a chapter…" autocomplete="off">' +
              '<button type="button" class="sx-btn" data-act="addch" data-s="' + esc(subj) + '">Add</button></div>';
      html += '</div></div>';
      index++;
    }

    if (!any) html += '<p style="text-align:center; color:#64748B; font-weight:600; margin-top:18px;">No syllabus yet — tap “＋ Add a subject” to start.</p>';
    container.innerHTML = html;

    // put back what the parent was doing
    Array.prototype.forEach.call(container.querySelectorAll('.syl-in'), function (el) {
      var v = vals[el.getAttribute('data-s')]; if (v) el.value = v;
    });
    if (typeof reevaluateTabDots === 'function') reevaluateTabDots();
  }

  // the dashboard calls populateSyllabus(s) on every load / 30s refresh
  window.populateSyllabus = function (s) {
    if (inflight > 0) return;                                // don't overwrite an edit that is still being saved
    render(s, false);
  };

  // ── talking to the server ──
  function refresh() {
    if (!currentStudentId) return;
    fetch(WEB_APP_URL + '?id=' + encodeURIComponent(currentStudentId))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status === 'ok' && j.data && j.data[currentStudentId]) {
          STUDENTS = j.data; currentStudent = j.data[currentStudentId];
          render(currentStudent, true);
        }
      }).catch(function () { });
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { if (inflight === 0) refresh(); }, 700);
  }
  function explain(j) {
    if (j.status === 'locked') return 'Your teacher marked this Completed — only the teacher can change it.';
    if (j.status === 'toomany') return 'Too many changes. Please try again in a few minutes.';
    if (j.status === 'notfound') return 'This chapter changed. Refreshing…';
    return (j.message || 'Could not save');
  }
  function send(payload) {
    inflight++;
    noteDone(); lsSet(TIP_KEY, '1');                         // they found the feature → no more pop-ups / tips
    return post(payload).then(function (j) {
      if (j.status !== 'success') toast(explain(j));
    }, function () {
      toast('Could not save. Check your internet.');
    }).then(function () { inflight--; scheduleRefresh(); });
  }

  // ── actions ──
  function doSet(subj, chap, to) {
    localSet(subj, chap, to); render(currentStudent, true);
    send({ type: 'SYL_SET', studentId: currentStudentId, subject: subj, chapter: chap, status: to });
  }
  function doAddChapter(subj, input) {
    var v = clean(input.value).slice(0, 80);
    if (!v) return;
    input.value = '';
    localAdd(subj, [v]); render(currentStudent, true);
    toast('Chapter added');
    send({ type: 'SYL_ADD', studentId: currentStudentId, subject: subj, chapters: [v] });
  }
  function doAddSubject(name, chaps) {
    var real = localAdd(name, chaps);
    openNext = real;
    render(currentStudent, true);
    toast(real + ' added');
    send({ type: 'SYL_ADD', studentId: currentStudentId, subject: name, chapters: chaps });
  }
  function doRemove(subj, chap) {
    if (!confirm('Remove “' + chap + '”?')) return;
    localRemove(subj, chap); render(currentStudent, true);
    send({ type: 'SYL_REMOVE', studentId: currentStudentId, subject: subj, chapter: chap });
  }

  // ── "Add a subject" pop-up ──
  var modal = null;
  function rowsBox() { return document.getElementById('sxRows'); }
  function renumber() {
    var rows = rowsBox().children;
    Array.prototype.forEach.call(rows, function (r, i) {
      r.querySelector('input').placeholder = 'Chapter ' + (i + 1);
      r.querySelector('.sx-rm').style.display = rows.length > 1 ? '' : 'none';
    });
  }
  function addRow(value, after, focus) {
    var box = rowsBox();
    if (box.children.length >= 20) { toast('You can add up to 20 chapters at a time'); return null; }
    var div = document.createElement('div'); div.className = 'sx-crow';
    div.innerHTML = '<input class="sx-in sx-cin" type="text" maxlength="80" autocomplete="off"><button type="button" class="sx-rm" data-sx="rm" title="Remove">✕</button>';
    if (after && after.nextSibling) box.insertBefore(div, after.nextSibling); else box.appendChild(div);
    var inp = div.querySelector('input'); inp.value = value || '';
    renumber();
    if (focus) inp.focus();
    return inp;
  }
  function setErr(msg, el) {
    document.getElementById('sxErr').textContent = msg || '';
    document.getElementById('sxSubj').classList.remove('bad');
    Array.prototype.forEach.call(rowsBox().querySelectorAll('.sx-in'), function (i) { i.classList.remove('bad'); });
    if (el) { el.classList.add('bad'); el.focus(); }
  }
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'sx sx-modal'; modal.id = 'sxAddModal';
    modal.innerHTML =
      '<div class="sx-box">' +
        '<div class="sx-title">Add a subject</div>' +
        '<div class="sx-fld"><label class="sx-lab" for="sxSubj">Subject</label>' +
          '<input class="sx-in" id="sxSubj" type="text" maxlength="40" placeholder="e.g. Science" autocomplete="off">' +
          '<div class="sx-chips" id="sxChips"></div></div>' +
        '<div class="sx-fld"><label class="sx-lab">Chapters</label><div id="sxRows"></div>' +
          '<button type="button" class="sx-more" data-sx="more">＋ Add another chapter</button>' +
          '<div class="sx-err" id="sxErr"></div></div>' +
        '<div class="sx-actions"><button type="button" class="sx-sec" data-sx="cancel">Cancel</button>' +
          '<button type="button" class="sx-btn" data-sx="save">Add subject</button></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      var t = e.target;
      if (t === modal) { closeModal(); return; }
      var b = t.closest ? t.closest('[data-sx]') : null; if (!b) return;
      var act = b.getAttribute('data-sx');
      if (act === 'cancel') closeModal();
      else if (act === 'more') addRow('', null, true);
      else if (act === 'rm') { var row = b.parentNode; if (rowsBox().children.length > 1) { row.parentNode.removeChild(row); renumber(); } }
      else if (act === 'chip') {
        document.getElementById('sxSubj').value = b.getAttribute('data-v'); setErr('');
        syncChips(); var first = rowsBox().querySelector('.sx-cin'); if (first) first.focus();
      }
      else if (act === 'save') saveSubject();
    });
    modal.addEventListener('input', function (e) { if (e.target.id === 'sxSubj') { syncChips(); } setErr(''); });
    modal.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (t.id === 'sxSubj') { e.preventDefault(); var f = rowsBox().querySelector('.sx-cin'); if (f) f.focus(); }
      else if (t.classList && t.classList.contains('sx-cin')) { e.preventDefault(); if (clean(t.value)) addRow('', t.parentNode, true); }
    });
    modal.addEventListener('paste', function (e) {            // pasting a list (one chapter per line) fills several rows
      var t = e.target;
      if (!(t.classList && t.classList.contains('sx-cin'))) return;
      var txt = (e.clipboardData || window.clipboardData) ? (e.clipboardData || window.clipboardData).getData('text') : '';
      if (!/\r?\n/.test(txt)) return;
      var lines = txt.split(/\r?\n/).map(clean).filter(Boolean);
      if (!lines.length) return;
      e.preventDefault();
      t.value = lines[0].slice(0, 80);
      var prev = t.parentNode;
      for (var i = 1; i < lines.length; i++) { var inp = addRow(lines[i].slice(0, 80), prev, false); if (!inp) break; prev = inp.parentNode; }
    });
    return modal;
  }
  function syncChips() {
    var v = clean(document.getElementById('sxSubj').value).toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll('#sxChips .sx-chip'), function (c) {
      c.classList.toggle('on', c.getAttribute('data-v').toLowerCase() === v);
    });
  }
  function openAdd() {
    var s = sdata();
    ensureModal();
    noteDone();
    document.getElementById('sxSubj').value = '';
    rowsBox().innerHTML = '';
    addRow('', null, false);
    setErr('');
    var have = {}; for (var k in ((s && s.syllabus) || {})) have[String(k).toLowerCase()] = 1;
    document.getElementById('sxChips').innerHTML = SUGGEST.filter(function (n) { return !have[n.toLowerCase()]; }).map(function (n) {
      return '<button type="button" class="sx-chip" data-sx="chip" data-v="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');
    modal.classList.add('show');
    setTimeout(function () { var i = document.getElementById('sxSubj'); if (i) i.focus(); }, 60);
  }
  function closeModal() { if (modal) modal.classList.remove('show'); }
  function saveSubject() {
    var nameEl = document.getElementById('sxSubj');
    var name = clean(nameEl.value).slice(0, 40);
    var seen = {}, chaps = [];
    Array.prototype.forEach.call(rowsBox().querySelectorAll('.sx-cin'), function (i) {
      var v = clean(i.value).slice(0, 80);
      if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; chaps.push(v); }
    });
    if (!name) { setErr('Please write the subject name', nameEl); return; }
    if (!chaps.length) { setErr('Add at least one chapter', rowsBox().querySelector('.sx-cin')); return; }
    closeModal();
    doAddSubject(name, chaps);
  }

  // ── one click handler for everything inside the Syllabus tab ──
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('#syllabusList')) return;
    if (t.closest('#sxAddBtn')) { openAdd(); return; }
    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var subj = el.getAttribute('data-s'), chap = el.getAttribute('data-c');
    if (act === 'locked') toast('Your teacher marked this Completed — only the teacher can change it.');
    else if (act === 'menu') { var k = subj + '\u0001' + chap; pickKey = (pickKey === k) ? null : k; render(currentStudent, true); }
    else if (act === 'pick') { pickKey = null; doSet(subj, chap, el.getAttribute('data-to')); }
    else if (act === 'del') doRemove(subj, chap);
    else if (act === 'addch') doAddChapter(subj, el.parentNode.querySelector('.syl-in'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('syl-in')) {
      e.preventDefault();
      doAddChapter(e.target.getAttribute('data-s'), e.target);
    }
    if (e.key === 'Escape') { closeModal(); if (noticeEl) noticeEl.classList.remove('show'); }
  });

  // show the update pop-up a moment after the dashboard opens (works together with the push add-on's own hook)
  var _open = window.openDashboard;
  if (typeof _open === 'function') {
    window.openDashboard = function () {
      var r = _open.apply(this, arguments);
      setTimeout(maybeNotice, 1400);
      return r;
    };
  }

  // if a student is already showing, draw the new version right away
  if (typeof currentStudent !== 'undefined' && currentStudent) render(currentStudent, true);
})();
