window.__ttcIc=window.__ttcIc||function(n){var P={lock:'<rect fill="currentColor" fill-opacity=".2" x="4.5" y="10.5" width="15" height="10.5" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',pencil:'<path fill="currentColor" fill-opacity=".2" d="M16 3l5 5L8 21H3v-5z"/><path d="M13.5 5.5l5 5"/>',book:'<path fill="currentColor" fill-opacity=".2" d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M8 7h8M8 11h5M4 21.5h16"/>',info:'<circle fill="currentColor" fill-opacity=".2" cx="12" cy="12" r="9.5"/><path d="M12 11v5M12 7.500v.1"/>',check:'<circle fill="currentColor" fill-opacity=".2" cx="12" cy="12" r="9.5"/><path d="M7.500 12.500l3 3 6-6.500"/>',clock:'<circle fill="currentColor" fill-opacity=".2" cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',bell:'<path fill="currentColor" fill-opacity=".2" d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'};return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+(P[n]||'')+'</svg>';};
/* ═══════════════════════════════════════════════════════════
   TTC Parent Dashboard — Web Push (Firebase Cloud Messaging)  v2
   Self-contained add-on. Loaded with ONE line in index.html.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FIREBASE_CONFIG = {
    apiKey:            'AIzaSyDno6o5euRzvnnOSHDPZg1QuFcDpYT-ZtA',
    authDomain:        'ttc-pd.firebaseapp.com',
    projectId:         'ttc-pd',
    storageBucket:     'ttc-pd.firebasestorage.app',
    messagingSenderId: '332737800913',
    appId:             '1:332737800913:web:14b34abe7b5b587fd373f0'
  };
  var VAPID_KEY = 'BLul7LkSpsHkMHJFLGI_g_TsVX2Co_zWC1gLPPjpFLyHoOC0q_LSjp1wjBOOiMAnUTfszNImomL7GQq4hLiQkWs';

  var FB_CDN = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var TABS = ['home', 'homework', 'progress', 'tests', 'syllabus', 'reviews'];

  var configured = FIREBASE_CONFIG.apiKey.indexOf('PASTE') !== 0 && VAPID_KEY.indexOf('PASTE') !== 0;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);

  var state = 'off';          // off | busy | on   (no "turn off" option anywhere — that's done in phone settings)
  var pendingTab = null;
  var sdkPromise = null;
  var testBusy = false;
  var helpTimer = null;

  function perm() { return ('Notification' in window) ? Notification.permission : 'denied'; }
  function key(id) { return 'ttc_push_' + id; }

  // ── Firebase SDK is loaded lazily, only when needed ──
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function getMessaging() {
    if (!sdkPromise) {
      sdkPromise = loadScript(FB_CDN + 'firebase-app-compat.js')
        .then(function () { return loadScript(FB_CDN + 'firebase-messaging-compat.js'); })
        .then(function () {
          if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
          return firebase.messaging();
        });
      sdkPromise.catch(function () { sdkPromise = null; });
    }
    return sdkPromise;
  }
  // ONE token request at a time (two parallel getToken calls can create a second, orphaned token)
  var tokenInflight = null;
  function getFcmToken() {
    if (!tokenInflight) {
      tokenInflight = (async function () {
        var reg = await navigator.serviceWorker.ready;       // re-uses your existing sw.js
        var m = await getMessaging();
        return m.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      })();
      var clear = function () { tokenInflight = null; };
      tokenInflight.then(clear, clear);
    }
    return tokenInflight;
  }
  async function post(arr) {
    var r = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(arr)
    });
    return r.json();
  }
  async function register(studentId, token, quiet) {     // → 'ok' | 'dead' | 'fail'
    var j = await post([{ type: 'REGISTER_TOKEN', studentId: studentId, token: token, quiet: !!quiet, ua: navigator.userAgent.slice(0, 120) }]);
    return j.status === 'success' ? 'ok' : (j.status === 'dead' ? 'dead' : 'fail');
  }
  // Firebase can keep handing back a stale token → throw it away and get a brand-new one
  async function freshToken() {
    var m = await getMessaging();
    try { await m.deleteToken(); } catch (e) { console.log('[ttc-push] deleteToken', e); }
    return getFcmToken();
  }
  // Registers; if the server says the token is dead, self-heals ONCE. Returns the working token, or null.
  async function registerHealing(studentId, token) {
    var r = await register(studentId, token);
    if (r === 'ok') return token;
    if (r === 'dead') {
      var fresh = await freshToken();
      if (await register(studentId, fresh) === 'ok') {
        await moveOthers(studentId, fresh);
        return fresh;
      }
    }
    return null;
  }
  // The old token is dead for EVERY student on this phone → move them all to the new token
  async function moveOthers(exceptId, token) {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('ttc_push_') === 0 && k.slice(9) !== exceptId) {
        try { if (await register(k.slice(9), token, true) === 'ok') localStorage.setItem(k, token); } catch (e) {}
      }
    }
  }

  // ── UI ──
  var HELP_TEXT = "Didn't get it? Open phone Settings → Apps → Chrome (or TTC PD) → Notifications → Allow, and switch off Battery Saver for it. Then tap “Send a test” again.";
  var BLOCKED_TEXT = 'Notifications are blocked on this phone.\n\nTo fix:\n1. Open phone Settings → Apps → Chrome (or TTC PD)\n2. Tap Notifications → Allow\n3. Come back here and tap “Enable notifications” again.';

  function setHint(msg) { var h = document.getElementById('ttcBellHint'); if (h) h.textContent = msg || ''; }

  function paint() {
    var w = document.getElementById('ttcBellWelcome');
    var t = document.getElementById('ttcTestBtn');
    var h = document.getElementById('ttcBellHdr');
    var dot = document.getElementById('ttcBellDot');
    if (w) {
      w.innerHTML = state === 'on' ? window.__ttcIc('check') + ' Notifications enabled' : (state === 'busy' ? window.__ttcIc('clock') + ' Please wait…' : window.__ttcIc('bell') + ' Enable notifications');
      w.style.background = state === 'on' ? 'var(--teal)' : 'var(--yellow)';
      w.style.cursor = state === 'on' ? 'default' : 'pointer';
    }
    if (t) t.style.display = state === 'on' ? 'inline-block' : 'none';
    if (h) h.title = state === 'on' ? 'Send a test notification' : 'Enable notifications';
    if (dot) dot.style.display = state === 'on' ? 'none' : 'block';   // red dot = "action needed"
    if (state !== 'on') setHint('');
  }

  function inject() {
    if (!configured) { console.warn('[ttc-push] Fill FIREBASE_CONFIG and VAPID_KEY in ttc-push.js'); return; }
    if (!supported && !isIOS) return;                       // in-app browsers etc. → no button

    var inner = document.querySelector('#welcomeScreen .welcome-inner');
    if (inner && !document.getElementById('ttcBellWelcome')) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:18px;text-align:center;position:relative;z-index:99;max-width:320px;margin-left:auto;margin-right:auto';
      var b = document.createElement('button');
      b.id = 'ttcBellWelcome'; b.type = 'button';
      b.style.cssText = "padding:11px 22px;font-family:'Fredoka One',cursive;font-size:15px;background:var(--yellow);color:var(--dark);border:3px solid var(--dark);border-radius:50px;box-shadow:4px 4px 0 var(--dark);cursor:pointer";
      b.onclick = function () { if (state === 'off') enable(); };
      var t = document.createElement('button');
      t.id = 'ttcTestBtn'; t.type = 'button'; t.textContent = 'Send a test notification';
      t.style.cssText = "display:none;margin-top:10px;background:none;border:none;color:var(--dark);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;text-decoration:underline;cursor:pointer";
      t.onclick = sendTest;
      var hint = document.createElement('div');
      hint.id = 'ttcBellHint';
      hint.style.cssText = "margin-top:8px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:var(--dark);line-height:1.4";
      wrap.appendChild(b); wrap.appendChild(document.createElement('br')); wrap.appendChild(t); wrap.appendChild(hint);
      inner.appendChild(wrap);
    }
    var logoutBtn = document.querySelector('.dash-header .logout-btn');
    if (logoutBtn && !document.getElementById('ttcBellHdr')) {
      var hb = document.createElement('button');
      hb.id = 'ttcBellHdr'; hb.type = 'button'; hb.className = 'logout-btn'; hb.style.marginLeft = '0'; hb.style.position = 'relative';
      hb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span id="ttcBellDot" style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:var(--rust);border:2px solid var(--white)"></span>';
      hb.onclick = function () {
        if (state === 'on') { sendTest().then(function () { var h = document.getElementById('ttcBellHint'); alert((h && h.textContent) || 'Test sent!'); }); }
        else enable();
      };
      logoutBtn.parentNode.insertBefore(hb, logoutBtn);
    }
    paint();
  }

  // ── Enable (must come from a tap) ──
  async function enable() {
    if (!window.currentStudentId || state === 'busy') return;
    var id = window.currentStudentId;

    if (isIOS && !isStandalone) {
      alert('To get alerts on iPhone:\n1. Tap the Share button in Safari\n2. Choose "Add to Home Screen"\n3. Open TTC from your Home Screen and tap the bell again.');
      return;
    }
    if (!supported) { alert('This browser does not support notifications. Please open this page in Chrome.'); return; }
    if (perm() === 'denied') { alert(BLOCKED_TEXT); return; }

    state = 'busy'; paint();
    try {
      var p = await Notification.requestPermission();
      if (p !== 'granted') { state = 'off'; paint(); if (p === 'denied') alert(BLOCKED_TEXT); return; }
      var token = await getFcmToken();
      var good = await registerHealing(id, token);
      if (good) {
        localStorage.setItem(key(id), good); state = 'on'; paint();
        setHint('Done! A welcome notification is on its way.');
        scheduleHelp();
        return;
      }
      state = 'off'; alert('Could not save. Please check your internet and try again.');
    } catch (e) {
      console.log('[ttc-push]', e); state = 'off';
      var why = (e && (e.code || e.message)) ? ' [' + String(e.code || e.message).slice(0, 90) + ']' : '';
      alert('Could not enable notifications' + why + '\n\nPlease open this app in Chrome, update Chrome, and try again. If it still fails, send this message to TTC.');
    }
    paint();
  }

  function scheduleHelp() {
    clearTimeout(helpTimer);
    helpTimer = setTimeout(function () { if (state === 'on') setHint(HELP_TEXT); }, 9000);
  }

  // ── "Send a test" → server sends the Hurray notification to THIS phone ──
  async function sendTest() {
    var id = window.currentStudentId; if (!id || testBusy) return;
    testBusy = true; setHint('⏳ Sending test…');
    try {
      var token = await getFcmToken();
      var r = await post([{ type: 'TEST_PUSH', studentId: id, token: token }]);
      if (r.status === 'success') { setHint('Test sent! Check your notifications.'); scheduleHelp(); }
      else if (r.status === 'wait') setHint('⏳ Please wait a few seconds, then try again.');
      else if (r.status === 'unregistered') {            // server lost this phone → silently sign it up again
        var good = await registerHealing(id, token);
        if (good) { localStorage.setItem(key(id), good); setHint('Re-enabled! A notification should arrive now.'); scheduleHelp(); }
        else setHint('This phone is not receiving notifications. In phone Settings → Apps → Chrome → Notifications, tap Allow, then tap “Enable notifications” again.');
      } else setHint('Could not send right now. Please try again in a minute.');
    } catch (e) { console.log('[ttc-push] test', e); setHint('Could not send. Check your internet and try again.'); }
    testBusy = false;
  }

  // ── After login: if permission is already granted, silently (re)register for THIS student ──
  async function syncAfterLogin() {
    var id = window.currentStudentId; if (!id) return;
    state = (localStorage.getItem(key(id)) && perm() === 'granted') ? 'on' : 'off'; paint();
    if (!configured || !supported || perm() !== 'granted') return;
    try {
      var token = await getFcmToken();
      var good = await registerHealing(id, token);       // runs at every login → also quietly repairs lost/dead registrations
      if (good) localStorage.setItem(key(id), good); else localStorage.removeItem(key(id));
      state = localStorage.getItem(key(id)) ? 'on' : 'off'; paint();
    } catch (e) { console.log('[ttc-push] sync', e); }
  }

  // ── Notification tap → open the right tab ──
  function openTab(t) { if (TABS.indexOf(t) !== -1 && typeof goToTab === 'function') goToTab(t); }
  function routeTab(t) {
    var dash = document.getElementById('dashboard');
    if (dash && dash.classList.contains('active')) openTab(t); else pendingTab = t;
  }
  var m = /tab=(\w+)/.exec(location.hash || '');
  if (m) { pendingTab = m[1]; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'ttc-open-tab') routeTab(e.data.tab);
    });
  }

  // ── Hook into existing functions WITHOUT editing them ──
  var _login = window.loginStudent;
  if (typeof _login === 'function') {
    window.loginStudent = async function () {
      var r = await _login.apply(this, arguments);
      if (window.currentStudentId) syncAfterLogin();
      return r;
    };
  }
  var _open = window.openDashboard;
  if (typeof _open === 'function') {
    window.openDashboard = function () {
      _open.apply(this, arguments);
      if (pendingTab) { var t = pendingTab; pendingTab = null; setTimeout(function () { openTab(t); }, 200); }
    };
  }

  // ── Heartbeat: every time the app opens / returns to the screen, quietly re-register every student on this phone.
  //    A row that was ever lost on the server simply comes back — no login, no tap, nothing for the parent to do. ──
  async function syncIds(ids, token) {
    var dead = false;
    for (var j = 0; j < ids.length; j++) {
      var r = await register(ids[j], token, true);
      if (r === 'ok') localStorage.setItem(key(ids[j]), token);
      else if (r === 'dead') dead = true;
    }
    return dead;
  }
  var lastSync = 0;
  async function silentSync() {
    if (!configured || !supported || perm() !== 'granted') return;
    if (Date.now() - lastSync < 10 * 60 * 1000) return;        // at most once per 10 minutes
    lastSync = Date.now();
    var ids = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('ttc_push_') === 0) ids.push(k.slice(9));
    }
    if (!ids.length) return;
    try {
      var token = await getFcmToken();
      if (await syncIds(ids, token)) {                          // server says this token is known-dead → fetch a fresh one (once)
        token = await freshToken();
        await syncIds(ids, token);
      }
    } catch (e) { console.log('[ttc-push] heartbeat', e); }
  }
  setTimeout(silentSync, 3000);                                  // when the app opens
  document.addEventListener('visibilitychange', function () {   // and whenever it comes back to the screen
    if (document.visibilityState === 'visible') silentSync();
  });

  inject();
})();
