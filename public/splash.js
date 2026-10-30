/* شاشة التحميل (Splash) لمنصة «الأمين في اللغة العربية» — مستر أمين الغازي.
   التصميم والحركة في splash.css. هذا الملف يتولّى: متى تظهر، رسم عناصرها، التوقيت (4 ثوانٍ بالضبط)،
   منع وميض الصفحة الرئيسية، انتظار الموارد الحرجة بهدوء، ثم انقلاب الشاشة كصفحة كتاب فتكشف المنصة.

   الاستخدام: سطران في <head> قبل أي CSS آخر (هما الوحيدان اللذان أُضيفا إلى index.html):
       <link rel="stylesheet" href="splash.css"><script src="splash.js"></script>
   إن لم يُحمَّل أيٌّ من الملفين (أو عُطّلت JavaScript) تُفتح الصفحة طبيعيًا بدون شاشة — لا يمكن أن تحجب المنصة.

   الإعدادات في CFG أدناه. للاختبار: أضف ‎?splash=1‎ إلى الرابط لإجبار الظهور أو ‎?splash=0‎ لإخفائها. */
(function (w, d) {
  'use strict';
  if (w.AlaminSplash) return;

  var CFG = {
    SHOW: 'entry',      /* 'entry' = عند فتح المنصة بالرابط/التحديث فقط (لا تتكرر عند التنقّل بين صفحاتها) · 'always' · 'never' */
    DURATION: 4000,     /* مدة الشاشة قبل بدء الفتح (ms) */
    EXIT: 900,          /* مدة انقلاب الصفحة (ms) */
    FONT_GRACE: 2500,   /* أقصى انتظار إضافي للخطوط بعد الثانية 4 */
    SLOW_AFTER: 6000,   /* بعد كم من التأخير تظهر لوحة «الاتصال أبطأ من المعتاد» */
    MAX_WAIT: 16000     /* بعدها تُفتح المنصة تلقائيًا إن كانت الصفحة والأنماط الأساسية جاهزة */
  };

  var R = d.documentElement;

  /* ---------- 1) متى تظهر؟ ---------- */
  function shouldShow() {
    var m = /[?&]splash=([01])(?:&|$)/.exec(w.location.search);
    if (m) return m[1] === '1';
    if (CFG.SHOW === 'always') return true;
    if (CFG.SHOW === 'never') return false;
    var type = '';
    try { var n = w.performance.getEntriesByType('navigation')[0]; type = n ? n.type : ''; } catch (e) { }
    if (type === 'back_forward') return false;                       /* رجوع/أمام: الصفحة معروضة سابقًا */
    if (type === 'navigate') {                                        /* نقرة من صفحة أخرى في المنصة نفسها */
      try { var ref = d.referrer; if (ref && new w.URL(ref).origin === w.location.origin) return false; } catch (e) { }
    }
    return true;                                                      /* رابط مباشر / رابط خارجي / تحديث الصفحة */
  }
  if (!shouldShow()) return;

  /* ---------- 2) الرسم: كتاب يفتح، حروف تتصاعد، وقلم يكتب الاسم ---------- */
  var LETTERS = [['ا', 7, 14, -8, 0], ['ل', 84, 9, 6, .2], ['ع', 91, 55, -5, .4], ['ر', 4, 60, 7, .1], ['ب', 76, 82, -6, .3], ['ي', 14, 86, 5, .5]];
  var MOTES = [[8,.2,5,3.6],[17,1.1,4,3.2],[26,.5,6,3.9],[36,1.7,4,3.0],[47,.9,5,3.7],[58,2.1,4,2.8],[67,.3,6,3.8],[76,1.4,4,3.1],[85,.7,5,3.5],[93,1.9,4,2.9],[12,2.3,5,2.6],[72,2.5,5,2.5]];
  /* حروف تخرج من الكتاب: [الحرف, إزاحة أفقية, إزاحة رأسية (بوحدة عرض الكتاب), دوران, الحجم, التأخير, المدة, اللون] */
  var UP = [['ع',-.62,-.95,-16,.24,.8,2.6,0],['ا',-.18,-1.2,6,.28,1.0,2.7,1],['ل',.3,-1.05,-10,.22,1.2,2.5,2],['ب',.7,-.8,14,.25,1.45,2.6,0],
            ['ق',-.85,-.45,-22,.27,1.7,2.5,1],['ي',.95,-.3,18,.23,1.95,2.4,2],['م',-.5,-.75,-8,.24,2.25,2.4,0],['ر',.45,-.7,10,.22,2.5,2.3,1],
            ['ن',0,-.95,4,.26,2.8,2.1,2],['ك',-.3,-1.1,-12,.22,3.1,1.9,0],['ه',.1,-1.2,8,.23,3.3,1.7,1]];
  var UPC = [['#E4F08F', 'rgba(198,217,75,.85)'], ['#8EF0E2', 'rgba(61,214,195,.85)'], ['#FFFFFF', 'rgba(255,255,255,.75)']];
  var SPARK = 'M0,-30C3,-9 9,-3 30,0C9,3 3,9 0,30C-3,9 -9,3 -30,0C-9,-3 -3,-9 0,-30Z';
  function spark(cls, x, y, wd, dl) {
    return '<svg class="spl__sp ' + cls + '" viewBox="-30 -30 60 60" style="--x:' + x + '%;--y:' + y + '%;--w:' + wd + '%;--d:' + dl + 's" aria-hidden="true" focusable="false"><path d="' + SPARK + '"/></svg>';
  }
  function inkLines(x0, dir) {                                          /* سطور الصفحة: تبدأ عند الحافّة الخارجية للصفحة وتمتدّ نحو الكعب (من اليمين لليسار في الصفحة اليمنى) */
    var out = '', k, y, xs, xe, L = [1, .96, .9, 1, .62];
    for (k = 0; k < 5; k++) {
      y = 55 + k * 13.5; xs = x0; xe = x0 - dir * 80 * L[k];
      out += '<path class="spl__ink" pathLength="1" style="--k:' + (dir > 0 ? k : k + 5) + '" d="M' + xs + ' ' + y + 'C' + (xs - dir * 26) + ' ' + (y - 5) + ' ' + (xe + dir * 26) + ' ' + (y - 5) + ' ' + xe + ' ' + (y + 3) + '"/>';
    }
    return out;
  }
  var PEN = '<svg class="spl__pen" viewBox="0 0 18 120" aria-hidden="true" focusable="false"><defs>' +
    '<linearGradient id="splpn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E4F08F"/><stop offset=".55" stop-color="#C6D94B"/><stop offset="1" stop-color="#8FA21F"/></linearGradient>' +
    '<radialGradient id="splpg"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#E4F08F" stop-opacity=".55"/><stop offset="1" stop-color="#C6D94B" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="9" cy="112" r="17" fill="url(#splpg)"/><path d="M1.5 3Q9 -1 16.5 3L15 80 9 112 3 80Z" fill="url(#splpn)"/>' +
    '<path d="M9 84V111" stroke="#0B1C33" stroke-width="1.4" stroke-linecap="round"/><path d="M3.5 12H14.5" stroke="#0B1C33" stroke-opacity=".3" stroke-width="3"/></svg>';
  var PEN2 = PEN.replace(/<defs>.*<\/defs>/, '').replace('url(#splpg)', 'url(#splpg)');
  function markup() {
    var s = '<div class="spl__veil" aria-hidden="true"><i class="spl__lat"></i>', i;
    LETTERS.forEach(function (l) { s += '<span class="spl__ltr" style="--x:' + l[1] + '%;--y:' + l[2] + '%;--r:' + l[3] + 'deg;--d:' + l[4] + 's">' + l[0] + '</span>'; });
    MOTES.forEach(function (m) { s += '<i class="spl__mote" style="--x:' + m[0] + '%;--d:' + m[1] + 's;--s:' + m[2] + 'px;--t:' + m[3] + 's"></i>'; });
    s += '<i class="spl__vig"></i></div><div class="spl__ui"><div class="spl__stage" aria-hidden="true"><i class="spl__rays"></i><i class="spl__halo"></i>' +
      '<svg class="spl__book" viewBox="0 0 240 150" focusable="false"><defs>' +
      '<linearGradient id="splpr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A9BC2A"/><stop offset=".2" stop-color="#D9E873"/><stop offset="1" stop-color="#F0F8BE"/></linearGradient>' +
      '<linearGradient id="splpl" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#A9BC2A"/><stop offset=".2" stop-color="#D9E873"/><stop offset="1" stop-color="#F0F8BE"/></linearGradient>' +
      '<linearGradient id="splsh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="splpc"><path d="M120 40C94 22 48 20 12 30L12 122C48 112 94 114 120 132Z"/><path d="M120 40C146 22 192 20 228 30L228 122C192 112 146 114 120 132Z"/></clipPath></defs>' +
      '<g class="spl__bkf"><path class="spl__cov" d="M4 34C44 22 96 24 120 44C144 24 196 22 236 34L236 130C196 120 144 122 120 142C96 122 44 120 4 130Z"/>' +
      '<g class="spl__pg spl__pg--l"><path class="spl__pgf" fill="url(#splpl)" d="M120 40C94 22 48 20 12 30L12 122C48 112 94 114 120 132Z"/>' + inkLines(106, 1) + '</g>' +
      '<g class="spl__pg spl__pg--r"><path class="spl__pgf" fill="url(#splpr)" d="M120 40C146 22 192 20 228 30L228 122C192 112 146 114 120 132Z"/>' + inkLines(214, 1) + '</g>' +
      '<path class="spl__spine" pathLength="1" d="M120 42V132"/>' +
      '<g clip-path="url(#splpc)"><g class="spl__shn"><rect x="-10" y="10" width="46" height="140" fill="url(#splsh)" transform="skewX(-18)"/></g></g></g></svg>' +
      '<div class="spl__up">';
    UP.forEach(function (u) {
      var c = UPC[u[7]];
      s += '<b style="--tx:' + u[1] + ';--ty:' + (u[2] * .8).toFixed(2) + ';--r:' + u[3] + 'deg;--z:' + u[4] + ';--d:' + u[5] + 's;--t:' + u[6] + 's;--c:' + c[0] + ';--g:' + c[1] + '">' + u[0] + '</b>';
    });
    s += '</div>' + spark('', -8, 10, 7, 2.5) + spark('spl__sp--w', 104, 2, 5.5, 2.65) + spark('', 108, 66, 4.5, 2.8) + spark('spl__sp--w', -6, 74, 4, 2.95) +
      '</div><div class="spl__txt"><div class="spl__brand">' +
      '<span class="spl__nm"><span class="spl__name">الأمين</span><svg class="spl__kash" viewBox="0 0 300 12" preserveAspectRatio="none" focusable="false"><path d="M298 6C230 -1 120 -1 2 6C120 3 230 3 298 6Z"/></svg>' +
      '<i class="spl__marks"></i><i class="spl__pw">' + PEN + '</i></span>' +
      '<span class="spl__nm"><span class="spl__name2">في اللغة العربية</span><i class="spl__pw spl__pw--b">' + PEN2 + '</i></span></div>' +
      '<div class="spl__who"><span class="spl__whoi"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13"/></svg></span>مستر أمين الغازي</div>' +
      '<div class="spl__prog">' +
      '<div class="spl__track" aria-hidden="true"><i class="spl__fill"></i><i class="spl__head"></i><b class="spl__d spl__d--r"></b><b class="spl__d spl__d--c"></b><b class="spl__d spl__d--l"></b></div>' +
      '<div class="spl__info" aria-hidden="true"><span class="spl__msgs">' +
      '<span class="spl__m spl__m1">نُجهّز الحبر والأقلام…</span>' +
      '<span class="spl__m spl__m2">نُرتّب لك الدروس والاختبارات…</span>' +
      '<span class="spl__m spl__m3"><span>اللغة العربية أسهل مما <span class="spl__hk">تتخيّل</span></span></span>' +
      '<span class="spl__m spl__m4">لحظات ونكون جاهزين…</span></span>' +
      '<b class="spl__pct">٠٪</b></div>' +
      '<div class="spl__alert" hidden><b class="spl__at"></b><span class="spl__ap"></span>' +
      '<span class="spl__ab"><button type="button" class="spl__btn spl__btn--p" data-act="retry">إعادة المحاولة</button><button type="button" class="spl__btn" data-act="go" hidden>المتابعة</button></span></div>' +
      '</div></div></div><i class="spl__shade"></i>' +
      '<p class="spl__sr" role="status" aria-live="polite">جارٍ تحميل منصة الأمين في اللغة العربية…</p>';
    return s;
  }

  /* التشكيل: «الأَمِينُ» — فتحة فوق الهمزة، كسرة تحت الميم، ضمّة فوق النون. تُوضع فوق حروفها الفعلية بعد تحميل الخط */
  var MK = {
    fa: '<svg class="spl__mk" viewBox="0 0 24 16" focusable="false" style="--x:%x;--y:%y;--d:2.2s"><path d="M3 12L21 4"/></svg>',
    ki: '<svg class="spl__mk" viewBox="0 0 24 16" focusable="false" style="--x:%x;--y:%y;--d:2.45s"><path d="M3 12L21 4"/></svg>',
    du: '<svg class="spl__mk spl__mk--d" viewBox="0 0 20 20" focusable="false" style="--x:%x;--y:%y;--d:2.7s"><path d="M6.5 7C6.5 3.8 11.8 3.8 11.8 7.2C11.8 9.8 8.6 10.3 7.2 9.1"/><path d="M11.4 9C12 12.5 9.4 15 5.5 16.2"/></svg>'
  };
  function placeMarks() {
    try {
      var nm = host.querySelector('.spl__name'), box = host.querySelector('.spl__marks'), tn = nm && nm.firstChild;
      if (!tn || tn.nodeType !== 3 || tn.nodeValue.length < 6) return;
      var fs = parseFloat(w.getComputedStyle(nm).fontSize), b = nm.getBoundingClientRect(), r = d.createRange();
      if (!fs || !b.width) return;
      function cx(i) { r.setStart(tn, i); r.setEnd(tn, i + 1); var q = r.getBoundingClientRect(); return ((q.left + q.right) / 2 - b.left) / fs; }
      function put(t, x, y) { return MK[t].replace('%x', x.toFixed(3) + 'em').replace('%y', y.toFixed(3) + 'em') + '<svg class="spl__bst" viewBox="-30 -30 60 60" style="--x:' + x.toFixed(3) + 'em;--y:' + y.toFixed(3) + 'em;--d:' + MK[t].match(/--d:([\d.]+)/)[1] + 's"><path d="' + SPARK + '"/></svg>'; }
      box.innerHTML = put('fa', cx(2) + P.fa[0], P.fa[1]) + put('ki', cx(3) + P.ki[0], P.ki[1]) + put('du', cx(5) + P.du[0], P.du[1]);
      host.classList.add('is-m');
    } catch (e) { }
  }
  var P = { fa: [0.09, 0.17], ki: [0, 1.2], du: [0, 0.4] };               /* إزاحة أفقية (em) ومكان رأسي (em من أعلى سطر الاسم) لكل علامة */

  /* ---------- 3) الحالة والمساعدات ---------- */
  var host, live, pctEl, st = { phase: 'run', t0: 0, fonts: false, last: -1, alert: '' };
  var killer = 0, dom = {};

  function bezier(x1, y1, x2, y2) {                                    /* نفس cubic-bezier الذي يقود شريط التقدّم في CSS */
    function f(t, a, b) { var u = 1 - t; return 3 * a * t * u * u + 3 * b * t * t * u + t * t * t; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) { var c = f(t, x1, x2); if (Math.abs(c - x) < 1e-4) break; if (c < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return f(t, y1, y2);
    };
  }
  var easeBar = bezier(.45, .05, .2, 1);
  function ar(n) { return String(n).replace(/\d/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.charAt(c); }); }
  function raf(fn) { w.requestAnimationFrame(fn); }

  function sameOrigin(u) { try { return new w.URL(u, w.location.href).origin === w.location.origin; } catch (e) { return false; } }
  /* الجاهزية الحرجة: الصفحة قُرئت بالكامل وكل ملفات CSS التابعة للمنصة نفسها طُبّقت (ما دونها لا تُعرض صفحة مكسورة) */
  function critical() {
    if (d.readyState === 'loading') return false;
    var ls = d.querySelectorAll('link[rel~="stylesheet"]');
    for (var i = 0; i < ls.length; i++) { if (ls[i].href && sameOrigin(ls[i].href) && !ls[i].sheet) return false; }
    return true;
  }
  function ready(e) {
    if (!critical() || d.readyState !== 'complete') return false;      /* complete = اكتمل load: الصور والأنماط والسكربتات */
    if (d.fonts && d.fonts.status === 'loading' && e < CFG.DURATION + CFG.FONT_GRACE) return false;
    return true;
  }
  function fontsLoaded() {                                              /* Cairo و El Messiri حُمّلا فعلًا (لا مجرد غياب القاعدة) */
    if (!d.fonts || !d.fonts.forEach) return true;
    var a = 0, b = 0;
    try { d.fonts.forEach(function (f) { var n = String(f.family).replace(/["']/g, ''); if (f.status === 'loaded') { if (n === 'Cairo') a = 1; else if (n === 'El Messiri') b = 1; } }); } catch (e) { return true; }
    return !!(a && b);
  }
  function setLive(t) { if (live) live.textContent = t; }

  /* ---------- 4) إنهاء/تحرير الصفحة (آمن للتكرار) ---------- */
  function finish() {
    if (st.phase === 'done') return;
    st.phase = 'done';
    w.clearTimeout(killer);
    try { R.classList.add('spl-go'); } catch (e) { }
    try { if (d.body) { d.body.inert = false; d.body.removeAttribute('inert'); } } catch (e) { }
    try { R.classList.remove('spl-lock'); R.classList.remove('spl-go'); R.classList.remove('spl-vis'); } catch (e) { }
    try { if (host && host.parentNode) host.parentNode.removeChild(host); } catch (e) { }
    w.AlaminSplash.done = true;
    try { w.dispatchEvent(new w.CustomEvent('alamin:splash-done')); } catch (e) { }
  }

  /* ---------- 5) الفتح: الشاشة تنقلب كصفحة كتاب فتكشف المنصة ---------- */
  function startExit() {
    if (st.phase === 'exit' || st.phase === 'done') return;
    st.phase = 'exit';
    setLive('تم تحميل المنصة');
    pctEl.textContent = '١٠٠٪';
    host.classList.remove('is-wait', 'is-alert');
    host.classList.add('is-exit');
    w.setTimeout(function () { R.classList.add('spl-go'); }, 160);     /* تبدأ حركة مدخل الصفحة مع أول انقلاب */
    if (w.matchMedia && w.matchMedia('(prefers-reduced-motion:reduce)').matches) { host.classList.add('is-fade'); w.setTimeout(finish, 650); return; }
    host.classList.add('is-turn');
    host.addEventListener('animationend', function (ev) { if (ev.target === host && ev.animationName === 'spl-turn') finish(); });
    w.setTimeout(finish, CFG.EXIT + 300);                                /* احتياط لو لم يصل animationend */
  }

  /* ---------- 6) البطء وانقطاع الاتصال ---------- */
  function showAlert(kind) {
    if (st.alert === kind) return;
    st.alert = kind;
    var t = host.querySelector('.spl__at'), p = host.querySelector('.spl__ap'), go = host.querySelector('[data-act="go"]');
    if (kind === 'offline') { t.textContent = 'لا يوجد اتصال بالإنترنت'; p.textContent = 'تأكّد من اتصالك وسنُكمل التحميل تلقائيًا فور عودته.'; }
    else { t.textContent = 'الاتصال أبطأ من المعتاد'; p.textContent = 'ما زلنا نُحمّل المنصة. يمكنك الانتظار قليلًا أو إعادة المحاولة.'; }
    go.hidden = !critical();
    host.querySelector('.spl__alert').hidden = false;
    host.classList.add('is-alert');
    setLive(t.textContent + '. ' + p.textContent);
  }
  function hideAlert() {
    if (!st.alert) return; st.alert = '';
    host.querySelector('.spl__alert').hidden = true; host.classList.remove('is-alert');
  }

  /* ---------- 7) الساعة: تقدّم متزامن مع شريط CSS ثم قرار الفتح ---------- */
  function tick(now) {
    if (st.phase === 'done' || st.phase === 'exit') return;
    if (!st.t0) { st.t0 = now; w.AlaminSplash.startedAt = now; }
    var e = now - st.t0;

    if (!st.fonts && (fontsLoaded() || e > 1300)) { st.fonts = true; host.classList.add('spl-t'); placeMarks(); }

    if (st.phase === 'run') {
      var p = Math.round(easeBar(Math.min(e, CFG.DURATION) / CFG.DURATION) * 100);
      if (p !== st.last) { st.last = p; pctEl.textContent = ar(p) + '٪'; }
      if (e >= CFG.DURATION) {
        if (ready(e)) { startExit(); return; }
        st.phase = 'wait'; host.classList.add('is-wait'); pctEl.textContent = '…';
        setLive('لحظات ونكون جاهزين…');
      }
    } else if (st.phase === 'wait') {
      if (ready(e) || (e > CFG.MAX_WAIT && critical())) { startExit(); return; }
      if (e > CFG.DURATION + CFG.SLOW_AFTER) showAlert(w.navigator.onLine === false ? 'offline' : 'slow');
      else if (w.navigator.onLine === false && e > CFG.DURATION + 1500) showAlert('offline');
      if (st.alert === 'offline' && w.navigator.onLine !== false) showAlert('slow');
    }
    raf(tick);
  }

  /* ---------- 8) التشغيل ---------- */
  try {
    w.AlaminSplash = { done: false, config: CFG };
    /* شبكة أمان مطلقة: مهما حدث لا تبقى الصفحة محجوبة أكثر من هذا */
    killer = w.setTimeout(finish, CFG.MAX_WAIT + 14000);

    host = d.createElement('div');
    host.id = 'spl'; host.className = 'spl';
    host.setAttribute('dir', 'rtl');
    host.innerHTML = markup();
    R.appendChild(host);

    /* لو لم يُحمَّل splash.css (مسار خاطئ/خطأ شبكة) لا نحجب شيئًا: نزيل الشاشة ونترك المنصة تعمل */
    if (w.getComputedStyle(host).position !== 'fixed') throw new Error('splash.css missing');

    R.classList.add('spl-lock');
    live = host.querySelector('.spl__sr'); pctEl = host.querySelector('.spl__pct'); 
    host.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('[data-act]'); if (!b) return;
      if (b.getAttribute('data-act') === 'retry') w.location.reload(); else if (critical()) startExit();
    });
    w.addEventListener('online', function () { if (st.phase === 'wait') hideAlert(); });

    /* خط Google Fonts الخارجي يحجب أول رسم للصفحة كلها (ومنها هذه الشاشة) فنجعله غير حاجب: يُحمَّل ويُطبَّق فور وصوله */
    if (w.MutationObserver) {
      var mo = new w.MutationObserver(function (ms) {
        ms.forEach(function (m) {
          for (var i = 0; i < m.addedNodes.length; i++) {
            var n = m.addedNodes[i];
            if (n.nodeType === 1 && n.tagName === 'LINK' && /(^|\s)stylesheet(\s|$)/.test(n.rel) && /fonts\.googleapis\.com/.test(n.href) && n.media !== 'print') {
              (function (l) { l.media = 'print'; var on = function () { l.media = 'all'; }; l.addEventListener('load', on); l.addEventListener('error', on); })(n);
            }
          }
        });
      });
      mo.observe(R, { childList: true, subtree: true });
      d.addEventListener('DOMContentLoaded', function () { mo.disconnect(); });
    }

    /* الصفحة خلف الشاشة لا تُستخدم بالكيبورد/قارئ الشاشة */
    if (d.body) d.body.inert = true;
    else d.addEventListener('DOMContentLoaded', function () { if (st.phase !== 'done' && d.body) d.body.inert = true; });

    /* أول رسم للشاشة يجب أن يكون فوريًا: الصفحة (وصورتها الكبيرة) تبقى مخفية حتى يُرسم أول إطار، ثم تُرسم خلفه.
       والحركة تبدأ من لحظة ظهور الشاشة فعلًا (أول رسم) لا من لحظة إدراجها، فتُرى الثواني الأربع كاملة. */
    var shown = false, started = false;
    function showPage() { if (shown) return; shown = true; R.classList.add('spl-vis'); }
    function go() { if (started || st.phase === 'done') return; started = true; host.classList.add('is-run'); raf(tick); w.setTimeout(showPage, 300); }
    try {
      new w.PerformanceObserver(function (list, ob) { if (list.getEntries().length) { ob.disconnect(); go(); } }).observe({ type: 'paint', buffered: true });
    } catch (e) { w.setTimeout(go, 100); }
    w.setTimeout(go, 1200);       /* احتياط: لو لم يصل إشعار الرسم */
    w.setTimeout(showPage, 2500);
  } catch (err) {
    finish();
  }
})(window, document);
