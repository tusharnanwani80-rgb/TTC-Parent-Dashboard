/* ═══════════════════════════════════════════════════════════
   TTC Parent Dashboard — Syllabus editing for parents / students
   Add subject · add chapter · mark Upcoming / Ongoing / Completed · remove own chapter
   Self-contained add-on (replaces populateSyllabus). Loaded with ONE line in index.html.
   Rules (also enforced by the server):
     • chapters a TEACHER marked Completed are locked 🔒 (Upcoming and Ongoing can be ticked)
     • you can remove only chapters you added yourself
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof populateSyllabus !== 'function') return;     // wrong page → do nothing

  var inflight = 0;
  var pickKey = null;          // which chapter currently has its status picker open
  var refreshTimer = null;

  // ── styles (re-use the app's own variables) ──
  var st = document.createElement('style');
  st.textContent =
    '.syl-topbar{display:flex;justify-content:flex-end;margin-bottom:12px}' +
    '.syl-add-subj{border:2.5px solid var(--dark);background:var(--lime);color:var(--dark);border-radius:50px;padding:8px 16px;font-family:"DM Sans",sans-serif;font-size:13px;font-weight:800;box-shadow:3px 3px 0 var(--dark);cursor:pointer}' +
    '.syl-form{display:none;background:var(--white);border:2.5px solid var(--dark);border-radius:18px;padding:14px;margin-bottom:14px;box-shadow:3px 3px 0 var(--dark)}' +
    '.syl-form.show{display:block}' +
    '.syl-form input,.syl-form textarea,.syl-in{width:100%;box-sizing:border-box;border:2px solid var(--dark);border-radius:12px;padding:10px 12px;font-family:"DM Sans",sans-serif;font-size:13px;font-weight:700;background:var(--white);color:var(--dark)}' +
    '.syl-form textarea{margin-top:8px;resize:vertical}' +
    '.syl-form .syl-go{margin-top:10px;width:100%}' +
    '.syl-go{border:2.5px solid var(--dark);background:var(--yellow);color:var(--dark);border-radius:12px;padding:9px 14px;font-family:"DM Sans",sans-serif;font-size:13px;font-weight:800;box-shadow:2px 2px 0 var(--dark);cursor:pointer;white-space:nowrap}' +
    '.syl-add{display:flex;gap:8px;margin-top:12px}' +
    '.syl-add .syl-in{flex:1;width:auto}' +
    '.syl-tap{cursor:pointer}' +
    '.syl-lock{cursor:not-allowed}' +
    '.syl-pick{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px 38px}' +
    '.syl-pick button{border:2px solid var(--dark);background:var(--white);color:var(--dark);border-radius:50px;padding:6px 11px;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:800;cursor:pointer}' +
    '.syl-pick button.on{background:var(--lime);box-shadow:2px 2px 0 var(--dark)}' +
    '.syl-by{font-size:9px;font-weight:800;color:var(--grey);white-space:nowrap}' +
    '.syl-by.me{color:var(--blue)}' +
    '.syl-del{border:none;background:none;color:var(--grey);font-size:16px;line-height:1;cursor:pointer;padding:0 2px}' +
    '#sylToast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);max-width:86%;background:var(--dark);color:#fff;font-family:"DM Sans",sans-serif;font-size:13px;font-weight:700;padding:10px 16px;border-radius:14px;z-index:9999;display:none;text-align:center}';
  document.head.appendChild(st);

  // ── tiny helpers ──
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
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
  }
  function localRemove(subj, chap) {
    var s = sdata(); var d = s && s.syllabus[subj]; if (!d) return;
    drop(d.completed || [], chap); drop(d.ongoing || [], chap); drop(d.pending || [], chap);
    if (s.sylMeta[subj]) delete s.sylMeta[subj][chap];
    if (!(d.completed || []).length && !(d.ongoing || []).length && !(d.pending || []).length) { delete s.syllabus[subj]; delete s.sylMeta[subj]; }
  }

  // ── rendering (same look as before + small controls) ──
  function render(s, force) {
    var container = document.getElementById('syllabusList');
    if (!container) return;
    if (!force) {                                           // the 30s auto-reload must never interrupt typing
      var a = document.activeElement;
      if (a && a.classList && (a.classList.contains('syl-in') || a.classList.contains('syl-subj-in') || a.classList.contains('syl-chaps-in'))) return;
    }

    // remember what the parent was doing
    var open = {}, vals = {};
    Array.prototype.forEach.call(container.querySelectorAll('.syllabus-subject.open'), function (el) { open[el.getAttribute('data-name')] = 1; });
    Array.prototype.forEach.call(container.querySelectorAll('.syl-in'), function (el) { if (el.value) vals[el.getAttribute('data-s')] = el.value; });
    var oldForm = document.getElementById('sylSubjForm');
    var formOpen = !!(oldForm && oldForm.classList.contains('show'));
    var fName = document.getElementById('sylSubjName') ? document.getElementById('sylSubjName').value : '';
    var fChaps = document.getElementById('sylSubjChaps') ? document.getElementById('sylSubjChaps').value : '';

    var html = '<div class="syl-topbar"><button type="button" class="syl-add-subj" id="sylAddSubjBtn">➕ Add subject</button></div>';
    html += '<div id="sylSubjForm" class="syl-form">' +
      '<input class="syl-subj-in" id="sylSubjName" maxlength="40" placeholder="Subject name (e.g. Science)">' +
      '<textarea class="syl-chaps-in" id="sylSubjChaps" rows="4" maxlength="1600" placeholder="Chapters — write one per line"></textarea>' +
      '<button type="button" class="syl-go" id="sylSubjGo">Add subject</button></div>';

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
      var chapterRow = function (chapName, kind) {
        var m = sm[chapName] || { p: 0, n: 0 };
        var locked = (kind === 'done') && !m.p;              // only a teacher-confirmed Completed is locked
        var act = locked ? 'locked' : 'menu';
        var cls = locked ? 'syl-lock' : 'syl-tap';
        var at = ' data-s="' + esc(subj) + '" data-c="' + esc(chapName) + '"';
        var chk, cn, tag;
        if (kind === 'done') {
          chk = '<div class="chk done ' + cls + '" data-act="' + act + '"' + at + '>✓</div>';
          cn = '<div class="cname done">' + esc(chapName) + '</div>';
          tag = '<div class="ctag done ' + cls + '" data-act="' + act + '"' + at + '>Completed</div>';
        } else if (kind === 'ongoing') {
          chk = '<div class="chk syl-tap" data-act="menu" style="background:#FFF3E0; border-color:#FF6B35; color:#FF6B35;"' + at + '>↻</div>';
          cn = '<div class="cname" style="color:#111118;">' + esc(chapName) + '</div>';
          tag = '<div class="ctag syl-tap" data-act="menu" style="background:#FFF3E0; color:#FF6B35; border: 1.5px solid #FF6B35;"' + at + '>Ongoing</div>';
        } else {
          chk = '<div class="chk pending syl-tap" data-act="menu"' + at + '>○</div>';
          cn = '<div class="cname pending">' + esc(chapName) + '</div>';
          tag = '<div class="ctag pending syl-tap" data-act="menu"' + at + '>Upcoming</div>';
        }
        var who = locked ? '<span class="syl-by">🔒 Teacher</span>' : (m.p ? '<span class="syl-by me">✍️ You</span>' : '');
        var del = m.n ? '<button type="button" class="syl-del" data-act="del"' + at + ' title="Remove">✕</button>' : '';
        var row = '<div class="syl-chapter">' + chk + cn + who + tag + del + '</div>';
        if (pickKey === subj + '\u0001' + chapName) {         // the little 3-choice picker under the chapter
          var cur = kind === 'done' ? 'Completed' : (kind === 'ongoing' ? 'Ongoing' : 'Pending');
          row += '<div class="syl-pick">' + [['Pending', '○ Upcoming'], ['Ongoing', '↻ Ongoing'], ['Completed', '✓ Completed']].map(function (o) {
            return '<button type="button" class="' + (o[0] === cur ? 'on' : '') + '" data-act="pick" data-to="' + o[0] + '"' + at + '>' + o[1] + '</button>';
          }).join('') + '</div>';
        }
        return row;
      };

      html += '<div class="syllabus-subject' + (open[subj] ? ' open' : '') + '" id="syl' + index + '" data-name="' + esc(subj) + '">';
      html += '<div class="syl-header" onclick="toggleSyllabus(' + index + ', \'' + sKey + '\', \'' + safeStrObj(comp) + '\')">';
      html += '<div class="syl-icon">📚</div>';
      html += '<div class="syl-name" style="display:flex; align-items:center;">' + cleanName + '<div class="inner-dot ' + (isNew ? 'active' : '') + '" id="dot_' + sKey + '"></div></div>';
      html += '<div class="syl-expand">▼</div></div><div class="syl-body">';
      comp.forEach(function (x) { html += chapterRow(x, 'done'); });
      ongo.forEach(function (x) { html += chapterRow(x, 'ongoing'); });
      pend.forEach(function (x) { html += chapterRow(x, 'pending'); });
      html += '<div class="syl-add"><input class="syl-in" data-s="' + esc(subj) + '" maxlength="80" placeholder="➕ Add a chapter">' +
              '<button type="button" class="syl-go" data-act="addch" data-s="' + esc(subj) + '">Add</button></div>';
      html += '</div></div>';
      index++;
    }

    if (!any) html += '<p style="text-align:center; color:var(--grey); margin-top:20px;">No syllabus yet — tap “➕ Add subject” to start.</p>';
    container.innerHTML = html;

    // put back what the parent was doing
    Array.prototype.forEach.call(container.querySelectorAll('.syl-in'), function (el) {
      var v = vals[el.getAttribute('data-s')]; if (v) el.value = v;
    });
    if (formOpen) {
      document.getElementById('sylSubjForm').classList.add('show');
      document.getElementById('sylSubjName').value = fName;
      document.getElementById('sylSubjChaps').value = fChaps;
    }
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
    if (j.status === 'locked') return '🔒 Your teacher has marked this — only the teacher can change it.';
    if (j.status === 'toomany') return '⏳ Too many changes. Please try again in a few minutes.';
    if (j.status === 'notfound') return 'This chapter changed. Refreshing…';
    return '⚠️ ' + (j.message || 'Could not save');
  }
  function send(payload) {
    inflight++;
    return post(payload).then(function (j) {
      if (j.status !== 'success') toast(explain(j));
    }, function () {
      toast('⚠️ Could not save. Check your internet.');
    }).then(function () { inflight--; scheduleRefresh(); });
  }

  // ── actions ──
  function doSet(subj, chap, to) {
    localSet(subj, chap, to); render(currentStudent, true);
    send({ type: 'SYL_SET', studentId: currentStudentId, subject: subj, chapter: chap, status: to });
  }
  function doAddChapter(subj, input) {
    var v = String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!v) return;
    input.value = '';
    localAdd(subj, [v]); render(currentStudent, true);
    toast('✅ Chapter added');
    send({ type: 'SYL_ADD', studentId: currentStudentId, subject: subj, chapters: [v] });
  }
  function doAddSubject() {
    var name = String(document.getElementById('sylSubjName').value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    var chaps = String(document.getElementById('sylSubjChaps').value || '').split(/\r?\n/)
      .map(function (x) { return x.replace(/\s+/g, ' ').trim().slice(0, 80); })
      .filter(Boolean).slice(0, 20);
    if (!name) { toast('Please write the subject name'); return; }
    if (!chaps.length) { toast('Please add at least one chapter'); return; }
    document.getElementById('sylSubjName').value = '';
    document.getElementById('sylSubjChaps').value = '';
    document.getElementById('sylSubjForm').classList.remove('show');
    localAdd(name, chaps);
    render(currentStudent, true);
    var d = document.querySelectorAll('.syllabus-subject');
    Array.prototype.forEach.call(d, function (el) { if (String(el.getAttribute('data-name')).toLowerCase() === name.toLowerCase()) el.classList.add('open'); });
    toast('✅ Subject added');
    send({ type: 'SYL_ADD', studentId: currentStudentId, subject: name, chapters: chaps });
  }
  function doRemove(subj, chap) {
    if (!confirm('Remove “' + chap + '”?')) return;
    localRemove(subj, chap); render(currentStudent, true);
    send({ type: 'SYL_REMOVE', studentId: currentStudentId, subject: subj, chapter: chap });
  }

  // ── one click handler for everything inside the Syllabus tab ──
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('#syllabusList')) return;
    if (t.closest('#sylAddSubjBtn')) { document.getElementById('sylSubjForm').classList.toggle('show'); return; }
    if (t.closest('#sylSubjGo')) { doAddSubject(); return; }
    var el = t.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var subj = el.getAttribute('data-s'), chap = el.getAttribute('data-c');
    if (act === 'locked') toast('🔒 Marked by your teacher — only the teacher can change this.');
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
  });

  // if a student is already showing, draw the new version right away
  if (typeof currentStudent !== 'undefined' && currentStudent) render(currentStudent, true);
})();
