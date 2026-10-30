/* course-lessons.js — دروس الكورس للطالب: أكورديون + مشغّل فيديو داخل المنصة.
   كل البيانات من student-courses.js (platform_data/courses_list) ومن مجموعة quizzes؛ لا توجد بيانات ثابتة هنا. */
(function () {
  'use strict';
  var C = window.AlaminCourses, E = C.esc, ar = C.ar, LS = [], L = {};
  var S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var IC = {
    play: '<svg viewBox="0 0 24 24" ' + S + '><circle cx="12" cy="12" r="10"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/></svg>',
    quiz: '<svg viewBox="0 0 24 24" ' + S + '><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16l1.5 1.5L14 14"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" ' + S + '><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5"/><text x="12" y="18" text-anchor="middle" font-size="6.5" font-weight="800" fill="currentColor" stroke="none" font-family="Cairo,sans-serif">PDF</text></svg>',
    lock: '<svg viewBox="0 0 24 24" ' + S + '><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="22" height="22" ' + S + '><path d="M6 6l12 12M18 6L6 18"/></svg>',
    p: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pa: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    v: '<svg viewBox="0 0 24 24" width="22" height="22" ' + S + '><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>',
    vm: '<svg viewBox="0 0 24 24" width="22" height="22" ' + S + '><path d="M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg>',
    fs: '<svg viewBox="0 0 24 24" width="22" height="22" ' + S + '><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>'
  };

  // ---------- الفيديو: أنماط الروابط التي تحفظها لوحة التحكم (watch / youtu.be / shorts / embed / live) ----------
  function yid(s) {
    if (s.youtubeId && /^[\w-]{11}$/.test(s.youtubeId)) return s.youtubeId;
    var u = String(s.videoUrl || '').trim();
    var m = u.match(/youtu\.be\/([\w-]{11})/) || u.match(/youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/) || u.match(/youtube\.com\/(?:embed|shorts|live)\/([\w-]{11})/);
    return m ? m[1] : '';
  }
  function srcOf(s) {
    if (s.bunnyVideoId && s.bunnyLibraryId) return { k: 'bunny', u: 'https://iframe.mediadelivery.net/embed/' + encodeURIComponent(s.bunnyLibraryId) + '/' + encodeURIComponent(s.bunnyVideoId) + '?autoplay=true&preload=true' };
    var y = yid(s); if (y) return { k: 'yt', id: y };
    var u = String(s.videoUrl || '').trim();
    if (/^https?:\/\/[^\s]+\.(mp4|webm)(\?|#|$)/i.test(u)) return { k: 'file', u: u };
    return null;
  }

  // ---------- الدرس (أكورديون): فيديوهات بترتيبها ثم الاختبار ثم الـ PDF، ويُعرض الموجود فقط ----------
  L.lesson = function (l, i) {
    LS[i] = l;
    var segs = C.segmentsOf(l), pdf = /^https?:\/\//i.test(l.pdfUrl || '') ? l.pdfUrl : '';
    var q = l.quizId != null && l.quizId !== '' ? String(l.quizId) : '';
    var cid = new URLSearchParams(location.search).get('course') || '';
    var d = segs.reduce(function (s, x) { return s + C.secs(x.duration); }, 0), meta = [];
    if (segs.length) meta.push('<span>' + ar(segs.length) + (segs.length === 1 ? ' مقطع' : ' مقاطع') + '</span>');
    if (d) meta.push('<span>' + ar(C.fmtDur(d)) + '</span>');
    if (q) meta.push('<span>اختبار</span>');
    if (pdf) meta.push('<span>ملزمة PDF</span>');
    var rows = segs.map(function (s, k) {
      var lk = !!s.locked;
      return '<li><button type="button" class="lx-row lx-v" data-play="' + i + ':' + k + '"' + (lk ? ' disabled' : '') + '><span class="lx-ic">' + (lk ? IC.lock : IC.play) + '</span><span class="lx-tx"><small>' + (lk ? 'مقطع مقفل' : 'فيديو ' + ar(k + 1)) + '</small><b>' + E(s.title || 'المقطع ' + ar(k + 1)) + '</b></span>' + (s.duration ? '<em>' + ar(E(s.duration)) + '</em>' : '') + (lk ? '' : '<span class="lx-go">شاهد الفيديو</span>') + '</button></li>';
    });
    if (q) rows.push('<li><div class="lx-row lx-q" data-quiz="' + E(q) + '"><span class="lx-ic">' + IC.quiz + '</span><span class="lx-tx"><small>اختبار</small><b>اختبار على الدرس</b></span><a class="lx-go" data-qa href="test.html?quiz=' + encodeURIComponent(q) + '&amp;course=' + encodeURIComponent(cid) + '">ابدأ الاختبار</a></div></li>');
    if (pdf) rows.push('<li><div class="lx-row lx-f"><span class="lx-ic">' + IC.pdf + '</span><span class="lx-tx"><small>ملف PDF</small><b>' + E(l.pdfName || 'ملزمة الدرس') + '</b></span><a class="lx-go" href="' + E(pdf) + '" target="_blank" rel="noopener">فتح الملف</a></div></li>');
    return '<details class="ls" data-i="' + i + '"><summary><span class="ls-h"><span class="ls-n">' + ar(i + 1) + '</span><span class="ls-t"><b>' + E(l.title || 'درس ' + ar(i + 1)) + '</b>' + (meta.length ? '<small>' + meta.join('') + '</small>' : '') + '</span></span></summary>' +
      '<div class="ls-b">' + (l.description ? '<p>' + E(l.description) + '</p>' : '') + (rows.length ? '<ul class="lx-list">' + rows.join('') + '</ul>' : '<p>لم تُضف محتويات لهذا الدرس بعد.</p>') + '</div></details>';
  };

  // فتح/إغلاق سلس
  document.addEventListener('click', function (e) {
    var s = e.target.closest && e.target.closest('.ls > summary');
    if (!s) return;
    e.preventDefault();
    var d = s.parentNode, b = d.querySelector('.ls-b');
    var still = !b.animate || (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);
    if (d.open) {
      if (still) { d.open = false; return; }
      b.animate([{ height: b.offsetHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 240, easing: 'ease' }).onfinish = function () { d.open = false; };
    } else {
      d.open = true;
      if (!still) b.animate([{ height: '0px', opacity: 0 }, { height: b.scrollHeight + 'px', opacity: 1 }], { duration: 260, easing: 'ease' });
    }
  });

  // ---------- رأس صفحة الكورس: عنوان بارز + غلاف مميّز + أيقونات على الجانبين + نص مختصر ----------
  var TAG = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/></svg>';
  function BD(cls, inner) { return '<span class="ch-ic ' + cls + '" aria-hidden="true"><svg viewBox="0 0 24 24" ' + S + '>' + inner + '</svg></span>'; }
  L.hero = function (c, g, ls, d, free, p, sep) {
    var I = C.ICON, back = g ? C.gradeUrl(g) : '/#courses', desc = String(c.desc || '').trim();
    var st = '<div class="ch-s"><span class="ch-si">' + I.play + '</span><span><b>' + ar(ls.length) + '</b><small>' + (ls.length === 1 ? 'درس' : 'دروس') + '</small></span></div>';
    if (d) st += '<div class="ch-s"><span class="ch-si">' + I.clock + '</span><span><b>' + ar(C.fmtDur(d)) + '</b><small>مدة الكورس</small></span></div>';
    st += '<div class="ch-s' + (free ? ' free' : '') + '"><span class="ch-si">' + (free ? I.gift : TAG) + '</span><span><b>' + (free ? 'مجاني' : (p ? E(p) : 'مدفوع')) + '</b><small>' + (free ? 'ابدأ الآن' : 'سعر الكورس') + '</small></span></div>';
    return '<section class="sc-hero ch"><div class="w">' +
      '<nav class="bc" aria-label="مسار التنقل"><a href="/">الرئيسية</a>' + sep + (g ? '<a href="' + C.gradeUrl(g) + '">' + E(g.title) + '</a>' : '<a href="/#courses">الصفوف الدراسية</a>') + sep + '<span>' + E(c.title || '') + '</span></nav>' +
      '<div class="ch-grid"><div class="ch-tx">' + (g ? '<a class="ch-eb" href="' + C.gradeUrl(g) + '">' + I.book + E(g.title) + '</a>' : '') +
      '<h1><span class="ch-hl">' + E(c.title || 'كورس بدون عنوان') + '</span></h1>' +
      (desc ? '<p class="ch-d">' + E(desc) + '</p><button type="button" class="ch-more" data-more hidden>اقرأ المزيد</button>' : '') +
      '<div class="ch-st">' + st + '</div><a class="ch-back" href="' + back + '">' + I.arrow + 'العودة لكورسات الصف</a></div>' +
      '<div class="ch-vis">' +
      BD('ch-i1', '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13"/>') +
      BD('ch-i2', '<circle cx="12" cy="12" r="10"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>') +
      BD('ch-i3', '<path d="M4 20l1-4L16.5 4.5a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8 19z"/><path d="M14 7l3 3"/>') +
      BD('ch-i4', '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>') +
      '<div class="cv-cover">' + C.coverHtml(c) + '</div></div></div></div></section>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-more]'); if (!b) return;
    var d = document.querySelector('.ch-d'); if (!d) return;
    var o = d.classList.toggle('open'); b.textContent = o ? 'عرض أقل' : 'اقرأ المزيد';
  });
  function clampCheck() {
    var d = document.querySelector('.ch-d'), b = document.querySelector('[data-more]');
    if (d && b && !d.classList.contains('open')) b.hidden = !(d.scrollHeight > d.clientHeight + 2);
  }
  // الإبقاء على الدروس المفتوحة عند وصول تحديث لحظي من لوحة التحكم
  L.openState = function () { return [].map.call(document.querySelectorAll('.ls[open]'), function (d) { return d.getAttribute('data-i'); }); };
  L.afterRender = function (open) {
    (open || []).forEach(function (i) { var d = document.querySelector('.ls[data-i="' + i + '"]'); if (d) d.open = true; });
    hydrate(); clampCheck(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(clampCheck);
  };

  // الاختبارات: رابط «ابدأ الاختبار» يفتح test.html دائمًا (الصفحة جزء من المنصة). كان هنا فحص HEAD لوجود test.html يحوّل
  // الزر إلى «قريبًا» عند فشله لأي سبب (استضافة ترفض HEAD، انقطاع لحظي، file://) — أُزيل.
  // عنوان الاختبار وعدد أسئلته للعرض فقط: من فهرس الاختبارات المشترك (AlaminData.quizzes) — كان لكل اختبار قراءة منفصلة
  // تتكرر مع كل تحديث لحظي للكورس؛ الآن صفر قراءات إضافية (الفهرس مستند واحد مشترك بين كل الاختبارات والصفحات).
  var qUnsub = null;
  function applyQuizMeta() {
    var AD = window.AlaminData; if (!AD) return;
    [].forEach.call(document.querySelectorAll('[data-quiz]'), function (r) {
      var q = AD.quizzes.metaOf(r.getAttribute('data-quiz')); if (!q) return;
      var n = q.questionsCount || q.qn || 0, b = r.querySelector('b'), sm = r.querySelector('small');
      if (q.title && b) b.textContent = q.title;
      if (n && sm) sm.textContent = 'اختبار · ' + ar(n) + ' سؤال';
    });
  }
  function hydrate() {
    var AD = window.AlaminData, rows = document.querySelectorAll('[data-quiz]');
    if (!rows.length || !AD) return;
    if (!qUnsub) qUnsub = AD.quizzes.subscribe(applyQuizMeta); // مستمع واحد للفهرس يُحدّث العناوين لحظيًا
    applyQuizMeta();
    var ids = [].map.call(rows, function (r) { return r.getAttribute('data-quiz'); });
    AD.quizzes.ensureMeta(ids).then(applyQuizMeta); // لا يقرأ شيئًا إلا لاختبار غير موجود بالفهرس (ولمرة واحدة)
  }

  // ---------- المشغّل داخل المنصة (YouTube IFrame API الرسمي، وBunny/ملف مباشر كما هي) ----------
  // منع الخروج إلى يوتيوب: المشغّل يُنشأ هنا بإطار iframe خاص (والـ API الرسمي يتحكم به) بقيدين من المتصفح نفسه:
  //  • sandbox بلا allow-popups ولا allow-top-navigation → ضغط الطالب على شعار يوتيوب أو عنوان الفيديو داخل المشغّل لا يفتح تبويبًا جديدًا ولا ينقل المنصة.
  //  • allow بلا clipboard-write / web-share → زر «نسخ الرابط» داخل المشغّل لا يستطيع نسخ رابط الفيديو الأصلي.
  // التشغيل لا يتأثر (allow-scripts + allow-same-origin كافيان لمشغّل يوتيوب). لإلغاء القيد ضع YT_SANDBOX = ''.
  // ملاحظة: شعار يوتيوب وعنوان الفيديو داخل الـ iframe لا يمكن إخفاؤهما بأي بارامتر رسمي (modestbranding أُلغي منذ 2023)، وسياسة يوتيوب تمنع تغطية المشغّل بطبقة فوقه.
  var YT_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-orientation-lock';
  var YT_ALLOW = 'autoplay; encrypted-media; picture-in-picture';
  var M, cur = null, yt = null, tick = 0, apiP = null, drag = false;
  function $(s) { return M.querySelector(s); }
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function ytSrc(id) {
    var q = ['enablejsapi=1', 'controls=0', 'fs=0', 'rel=0', 'iv_load_policy=3', 'playsinline=1', 'modestbranding=1'];
    if (/^https?:/.test(location.protocol)) q.push('origin=' + encodeURIComponent(location.origin));
    return 'https://www.youtube-nocookie.com/embed/' + id + '?' + q.join('&');
  }
  function ytFrame(id) {
    var f = document.createElement('iframe');
    f.src = ytSrc(id); f.title = 'الفيديو';
    if (YT_SANDBOX) f.setAttribute('sandbox', YT_SANDBOX);
    f.setAttribute('allow', YT_ALLOW);
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); // يوتيوب يشترط وصول مصدر الصفحة (Referer) وإلا يظهر خطأ في التضمين
    return f;
  }
  // الجوال: بعد دخول ملء الشاشة نثبّت الاتجاه الأفقي (Android Chrome يسمح بذلك داخل ملء الشاشة فقط) ونحرّره عند الخروج. iPhone لا يدعم ذلك فيُتجاهل بصمت.
  function lockLandscape() {
    try { if (window.matchMedia('(pointer:coarse)').matches && screen.orientation && screen.orientation.lock) Promise.resolve(screen.orientation.lock('landscape')).catch(function () {}); } catch (e) {}
  }
  function unlockOrientation() { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {} }
  function build() {
    if (M) return;
    M = document.createElement('div'); M.className = 'lx-m'; M.hidden = true;
    M.innerHTML = '<div class="lx-card" role="dialog" aria-modal="true" aria-label="مشغّل الدرس"><div class="lx-top"><b class="lx-t"></b><button type="button" class="lx-x" aria-label="إغلاق المشغّل">' + IC.x + '</button></div>' +
      '<div class="lx-vid"><div class="lx-stage" data-s="load"><div class="lx-slot"></div><div class="lx-msg"><span class="lx-spin"></span><span class="lx-mt">جارٍ تحميل الفيديو…</span><button type="button" class="lx-retry" hidden>إعادة المحاولة</button></div></div>' +
      '<div class="lx-bar" hidden><input class="lx-rg" type="range" min="0" max="0" step="1" value="0" aria-label="موضع التشغيل"><button type="button" class="lx-cb lx-pp" aria-label="تشغيل">' + IC.p + '</button><button type="button" class="lx-cb lx-mu" aria-label="كتم الصوت">' + IC.v + '</button><input class="lx-vol" type="range" min="0" max="100" value="100" aria-label="مستوى الصوت"><span class="lx-time">0:00</span><span style="flex:1"></span>' +
      '<select class="lx-sp" aria-label="سرعة التشغيل"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select><button type="button" class="lx-cb lx-fs" aria-label="ملء الشاشة">' + IC.fs + '</button></div></div></div>';
    document.body.appendChild(M);
    M.addEventListener('click', function (e) { if (e.target === M) close(); });
    M.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    $('.lx-x').onclick = close;
    $('.lx-retry').onclick = function () { if (cur) open(cur.i, cur.k, cur.from); };
    $('.lx-pp').onclick = function () { if (!yt) return; yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo(); };
    $('.lx-mu').onclick = function () { if (!yt) return; if (yt.isMuted()) yt.unMute(); else yt.mute(); sync(); };
    $('.lx-vol').oninput = function () { if (yt) { yt.setVolume(+this.value); if (+this.value > 0 && yt.isMuted()) yt.unMute(); sync(); } };
    $('.lx-sp').onchange = function () { if (yt) yt.setPlaybackRate(+this.value); };
    var rg = $('.lx-rg');
    rg.onpointerdown = function () { drag = true; }; rg.onpointerup = function () { drag = false; };
    rg.oninput = function () { if (yt) { yt.seekTo(+this.value, true); $('.lx-time').textContent = tm(+this.value) + ' / ' + tm(+this.max); } };
    var vid = $('.lx-vid'), fsb = $('.lx-fs'), fsReq = vid.requestFullscreen || vid.webkitRequestFullscreen;
    // iPhone لا يدعم ملء الشاشة لعنصر عادي: نخفي الزر (كان يبقى ظاهرًا بلا وظيفة) ويكفي تدوير الهاتف أفقيًا فيملأ المشغّل الشاشة بالـ CSS
    if (!fsReq) fsb.hidden = true;
    fsb.onclick = function () {
      if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (fsReq) Promise.resolve(fsReq.call(vid)).then(lockLandscape, function () {});
    };
    var onFs = function () { if (!fsEl()) unlockOrientation(); };
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
  }
  function tm(t) { return C.fmtDur(Math.floor(t || 0)) || '0:00'; }
  function state(s, msg, retry) { var st = $('.lx-stage'); st.dataset.s = s; if (msg) $('.lx-mt').textContent = msg; $('.lx-retry').hidden = !retry; }
  function fail(msg, retry) { $('.lx-bar').hidden = true; state('err', msg, retry); }
  function sync() {
    if (!yt || !yt.getPlayerState) return;
    var pl = yt.getPlayerState() === 1, mu = yt.isMuted() || yt.getVolume() === 0;
    var pp = $('.lx-pp'), mb = $('.lx-mu');
    pp.innerHTML = pl ? IC.pa : IC.p; pp.setAttribute('aria-label', pl ? 'إيقاف مؤقت' : 'تشغيل');
    mb.innerHTML = mu ? IC.vm : IC.v; mb.setAttribute('aria-label', mu ? 'إلغاء كتم الصوت' : 'كتم الصوت');
  }
  function loadApi() {
    if (window.YT && YT.Player) return Promise.resolve();
    return apiP || (apiP = new Promise(function (res, rej) {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); res(); };
      var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = function () { apiP = null; rej(new Error('api')); };
      document.head.appendChild(s);
      setTimeout(function () { if (!(window.YT && YT.Player)) { apiP = null; rej(new Error('timeout')); } }, 12000);
    }));
  }
  function ytErr(c) {
    if (c === 101 || c === 150) return 'صاحب الفيديو لا يسمح بتشغيله داخل المنصة. تأكد من إعدادات التضمين للفيديو على يوتيوب.';
    if (c === 100) return 'هذا الفيديو غير موجود أو تم حذفه أو أصبح خاصًا. تأكد من الرابط في لوحة التحكم.';
    if (c === 2) return 'رابط الفيديو غير صالح. تأكد من الرابط في لوحة التحكم.';
    return 'تعذّر تشغيل هذا الفيديو الآن. حاول مرة أخرى بعد قليل.';
  }
  function open(i, k, from) {
    build();
    var s = C.segmentsOf(LS[i] || {})[k]; if (!s) return;
    stop(); cur = { i: i, k: k, from: from };
    $('.lx-t').textContent = s.title || 'المقطع ' + ar(k + 1);
    M.hidden = false; document.body.style.overflow = 'hidden';
    state('load', 'جارٍ تحميل الفيديو…'); $('.lx-bar').hidden = true;
    var src = srcOf(s), slot = $('.lx-slot');
    if (!src) fail('رابط هذا الفيديو غير صالح أو غير مدعوم. تأكد من إدخال رابط يوتيوب صحيح في لوحة التحكم.');
    else if (src.k === 'bunny') { slot.innerHTML = '<iframe src="' + E(src.u) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="الفيديو"></iframe>'; state('ready'); }
    else if (src.k === 'file') { slot.innerHTML = '<video controls playsinline autoplay src="' + E(src.u) + '"></video>'; slot.firstChild.onerror = function () { fail('تعذّر تشغيل ملف الفيديو.', true); }; state('ready'); }
    else {
      loadApi().then(function () {
        if (!cur || cur.i !== i || cur.k !== k) return;
        var h = ytFrame(src.id); slot.appendChild(h);
        yt = new YT.Player(h, {
          events: {
            onReady: function () { state('ready'); $('.lx-bar').hidden = false; $('.lx-sp').value = '1'; yt.playVideo(); sync(); tick = setInterval(poll, 400); },
            onStateChange: sync,
            onError: function (e) { fail(ytErr(e.data), e.data !== 100 && e.data !== 101 && e.data !== 150 && e.data !== 2); }
          }
        });
      }, function () { fail('تعذّر تحميل مشغّل الفيديو. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.', true); });
    }
    $('.lx-x').focus();
  }
  function poll() {
    if (!yt || !yt.getCurrentTime) return;
    var t = yt.getCurrentTime(), d = yt.getDuration(), rg = $('.lx-rg');
    rg.max = Math.floor(d || 0); if (!drag) rg.value = Math.floor(t);
    $('.lx-time').textContent = tm(t) + ' / ' + tm(d);
  }
  function stop() {
    clearInterval(tick); drag = false;
    if (yt) { try { yt.destroy(); } catch (e) {} yt = null; }
    if (M) $('.lx-slot').innerHTML = '';
  }
  function close() {
    if (!M || M.hidden) return;
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    var f = cur && cur.from; stop(); cur = null; M.hidden = true; document.body.style.overflow = '';
    if (f && f.focus) f.focus();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-play]'); if (!b || b.disabled) return;
    var p = b.getAttribute('data-play').split(':'); open(+p[0], +p[1], b);
  });

  L._t = { yid: yid, srcOf: srcOf };
  window.AlaminLessons = L;
})();
