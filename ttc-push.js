/* ═══════════════════════════════════════════════════════════
   TTC Parent Dashboard — Web Push (Firebase Cloud Messaging)
   Self-contained add-on. Loaded with ONE line in index.html.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // 🔴 FILL THESE (Firebase Console → Project settings → Your apps → Web app) 🔴
  var FIREBASE_CONFIG = {
    apiKey:            'PASTE_apiKey',
    authDomain:        'PASTE_authDomain',
    projectId:         'PASTE_projectId',
    storageBucket:     'PASTE_storageBucket',
    messagingSenderId: 'PASTE_messagingSenderId',
    appId:             'PASTE_appId'
  };
  // 🔴 Firebase Console → Project settings → Cloud Messaging → Web Push certificates → "Key pair"
  var VAPID_KEY = 'PASTE_VAPID_KEY_PAIR';

  var FB_CDN = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var TABS = ['home', 'homework', 'progress', 'tests', 'syllabus', 'reviews'];

  var configured = FIREBASE_CONFIG.apiKey.indexOf('PASTE') !== 0 && VAPID_KEY.indexOf('PASTE') !== 0;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);

  var state = 'off';          // off | busy | on
  var pendingTab = null;
  var sdkPromise = null;

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
  async function getFcmToken() {
    var reg = await navigator.serviceWorker.ready;           // re-uses your existing sw.js
    var m = await getMessaging();
    return m.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  }
  async function register(studentId, token) {
    var r = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify([{ type: 'REGISTER_TOKEN', studentId: studentId, token: token, ua: navigator.userAgent.slice(0, 120) }])
    });
    var j = await r.json();
    return j.status === 'success';
  }

  // ── Button UI ──
  function paint() {
    var w = document.getElementById('ttcBellWelcome');
    var h = document.getElementById('ttcBellHdr');
    var labels = { off: '🔔 Get homework & test alerts', busy: '⏳ Enabling…', on: '✅ Alerts are ON on this phone' };
    if (w) { w.textContent = labels[state]; w.style.background = state === 'on' ? 'var(--teal)' : 'var(--yellow)'; }
    if (h) {
      h.style.background = state === 'on' ? 'var(--teal)' : 'var(--white)';
      h.title = state === 'on' ? 'Alerts are ON' : 'Turn on alerts';
    }
  }
  function inject() {
    if (!configured) { console.warn('[ttc-push] Fill FIREBASE_CONFIG and VAPID_KEY in ttc-push.js'); return; }
    if (!supported && !isIOS) return;                       // in-app browsers etc. → no button

    var inner = document.querySelector('#welcomeScreen .welcome-inner');
    if (inner && !document.getElementById('ttcBellWelcome')) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:18px;text-align:center;position:relative;z-index:99';
      var b = document.createElement('button');
      b.id = 'ttcBellWelcome'; b.type = 'button';
      b.style.cssText = "padding:11px 22px;font-family:'Fredoka One',cursive;font-size:15px;background:var(--yellow);color:var(--dark);border:3px solid var(--dark);border-radius:50px;box-shadow:4px 4px 0 var(--dark);cursor:pointer";
      b.onclick = enable;
      wrap.appendChild(b); inner.appendChild(wrap);
    }
    var logoutBtn = document.querySelector('.dash-header .logout-btn');
    if (logoutBtn && !document.getElementById('ttcBellHdr')) {
      var hb = document.createElement('button');
      hb.id = 'ttcBellHdr'; hb.type = 'button'; hb.className = 'logout-btn'; hb.style.marginLeft = '0';
      hb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
      hb.onclick = enable;
      logoutBtn.parentNode.insertBefore(hb, logoutBtn);
    }
    paint();
  }

  // ── Main action: tap the bell ──
  async function enable() {
    if (!window.currentStudentId || state === 'busy') return;
    var id = window.currentStudentId;

    if (isIOS && !isStandalone) {
      alert('To get alerts on iPhone:\n1. Tap the Share button in Safari\n2. Choose "Add to Home Screen"\n3. Open TTC from your Home Screen and tap this bell again.');
      return;
    }
    if (!supported) { alert('This browser does not support notifications. Please use Chrome.'); return; }
    if (perm() === 'denied') { alert('Notifications are blocked for this app. Please allow them in your phone/browser settings, then try again.'); return; }

    state = 'busy'; paint();
    try {
      var p = await Notification.requestPermission();      // must come from a tap ✔
      if (p !== 'granted') { state = 'off'; paint(); return; }
      var token = await getFcmToken();
      if (await register(id, token)) { localStorage.setItem(key(id), token); state = 'on'; }
      else { state = 'off'; alert('Could not save. Please check your internet and try again.'); }
    } catch (e) {
      console.log('[ttc-push]', e); state = 'off'; alert('Could not enable alerts: ' + e.message);
    }
    paint();
  }

  // ── After login: if permission is already granted, silently (re)register for THIS student ──
  async function syncAfterLogin() {
    var id = window.currentStudentId; if (!id) return;
    state = (localStorage.getItem(key(id)) && perm() === 'granted') ? 'on' : 'off'; paint();
    if (!configured || !supported || perm() !== 'granted') return;
    try {
      var token = await getFcmToken();
      if (localStorage.getItem(key(id)) !== token && await register(id, token)) localStorage.setItem(key(id), token);
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

  inject();
})();
