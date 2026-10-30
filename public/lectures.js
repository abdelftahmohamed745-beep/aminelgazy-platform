/* lectures.js — صفحة المحاضرات العامة (بدون تسجيل دخول أو كود سنتر).
   المصدر: نفس بيانات قسم «المحاضرات» في لوحة التحكم، عبر الطبقة المشتركة platform-data.js (AlaminData.lectures):
   المستند الواحد platform_data/lectures_list { lectures: [...] } الذي تكتبه الداشبورد مع كل إضافة/حذف = قراءة واحدة بدل قراءة
   كل مستندات المجموعة مرتين؛ ولو لم يكن موجودًا يُستخدم المصدر الأصلي (مجموعة lectures). نسخة 'alamin_lectures' على الجهاز
   تُعرض فورًا وتُستخدم عند الانقطاع. أي إضافة أو حذف من الداشبورد يظهر هنا لحظيًا دون تحديث. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SEC = ['1', '2', '3'], PREP = ['prep1', 'prep2', 'prep3'];
  var LBL = { '1': 'أولى ثانوي', '2': 'ثانية ثانوي', '3': 'ثالثة ثانوي', prep1: 'أولى إعدادي', prep2: 'ثانية إعدادي', prep3: 'ثالثة إعدادي' };
  var IC = {
    play: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    cap: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 2.5 9.5 12 14.5l9.5-5Z"/><path d="M6.5 12.2V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-3.8"/></svg>',
    book: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13"/></svg>',
    grid: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    arrow: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    spark: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/></svg>',
    tag: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8zM7.5 8.5h.01"/></svg>',
    cal: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
  };
  var BI = {
    'نصوص': '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h4"/></svg>',
    'قراءة': '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5.5C4.5 4 8 4 12 6.5c4-2.5 7.5-2.5 10-1v13c-2.5-1.5-6-1.5-10 1-4-2.5-7.5-2.5-10-1zM12 6.5v13"/></svg>',
    'بلاغة': '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H5.5A1.5 1.5 0 004 8.5V12h4a2 2 0 01-2 3M20 7h-3.5A1.5 1.5 0 0015 8.5V12h4a2 2 0 01-2 3"/></svg>',
    'نحو': '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5zM3 12.5l9 5 9-5"/></svg>',
    'أدب': '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19zM14 7l3 3"/></svg>'
  };
  var all = [], grade = 'all', branch = '', q = '', opener = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ar(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function ytId(u) { var m = String(u || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim(); }
  function gcode(g) { return typeof window.normalizeGrade === 'function' ? window.normalizeGrade(g) : String(g == null ? '' : g).trim(); }
  function when(l) {
    var d = l.createdAt ? new Date(l.createdAt) : null;
    if (d && !isNaN(d)) { try { return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch (e) { } }
    return l.date || '';
  }

  /* ---------- البيانات ---------- */
  function clean(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (l) {
      if (!l || !ytId(l.url)) return;
      var k = String(l.id || l.url); if (seen[k]) return; seen[k] = 1;
      out.push({ id: k, title: String(l.title || 'محاضرة بدون عنوان'), url: l.url, yt: ytId(l.url), grade: gcode(l.grade), branch: String(l.branch || ''), note: String(l.note || ''), createdAt: l.createdAt || '', date: l.date || '' });
    });
    return out.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }
  function readLocal() { try { var a = JSON.parse(localStorage.getItem('alamin_lectures') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

  /* ---------- العرض ---------- */
  function visible() {
    var nq = norm(q);
    return all.filter(function (l) {
      return (grade === 'all' || l.grade === grade) && (!branch || l.branch === branch) &&
        (!nq || norm(l.title + ' ' + l.branch + ' ' + l.note).indexOf(nq) > -1);
    });
  }
  function bic(b) { return BI[b] || IC.tag; }
  function tabs() {
    var codes = SEC.concat(PREP.filter(function (c) { return all.some(function (l) { return l.grade === c; }); }));
    $('lcTabs').innerHTML = ['all'].concat(codes).map(function (c) {
      var n = c === 'all' ? all.length : all.filter(function (l) { return l.grade === c; }).length;
      return '<button type="button" data-g="' + c + '" aria-pressed="' + (grade === c) + '">' + (c === 'all' ? IC.grid : IC.cap) + '<span>' + (c === 'all' ? 'كل المحاضرات' : LBL[c]) + '</span><em>' + ar(n) + '</em></button>';
    }).join('');
  }
  function chips() {
    var pool = all.filter(function (l) { return grade === 'all' || l.grade === grade; }), seen = {}, bs = [];
    pool.forEach(function (l) { if (l.branch && l.branch !== 'عام' && !seen[l.branch]) { seen[l.branch] = 1; bs.push(l.branch); } });
    if (branch && bs.indexOf(branch) < 0) branch = '';
    var el = $('lcBranches'); el.hidden = bs.length < 1;
    el.innerHTML = bs.length ? ['الكل'].concat(bs).map(function (b, i) {
      var v = i ? b : '';
      return '<button type="button" data-b="' + esc(v) + '" aria-pressed="' + (branch === v) + '">' + (i ? bic(b) : IC.grid) + esc(b) + '</button>';
    }).join('') : '';
  }
  function thumbImg(l) { return '<img src="https://i.ytimg.com/vi/' + l.yt + '/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">'; }
  function card(l) {
    var g = LBL[l.grade] || '', d = when(l), t = esc(l.title), id = esc(l.id), hb = l.branch && l.branch !== 'عام';
    return '<article class="lc"><button class="lc-th" type="button" data-id="' + id + '" aria-label="تشغيل ' + t + '">' + thumbImg(l) +
      (hb ? '<span class="lc-tag">' + bic(l.branch) + esc(l.branch) + '</span>' : '') + (g ? '<span class="lc-gr">' + IC.cap + esc(g) + '</span>' : '') +
      '<span class="lc-play">' + IC.play + '</span></button>' +
      '<div class="lc-b"><h3>' + t + '</h3>' + (d ? '<div class="lc-m"><span>' + IC.cal + esc(d) + '</span></div>' : '') +
      (l.note ? '<p class="lc-n">' + esc(l.note) + '</p>' : '') +
      '<button class="lc-go" type="button" data-id="' + id + '"><span>شاهد المحاضرة</span>' + IC.arrow + '</button></div></article>';
  }
  function feat() {
    var el = $('lcFeat'), l = all[0]; el.hidden = !l; if (!l) { el.innerHTML = ''; return; }
    var g = LBL[l.grade] || '', d = when(l), t = esc(l.title), id = esc(l.id), hb = l.branch && l.branch !== 'عام';
    el.innerHTML = '<article class="lc-ft"><button class="lc-th" type="button" data-id="' + id + '" aria-label="تشغيل ' + t + '">' + thumbImg(l) +
      '<span class="lc-tag lc-new">' + IC.spark + 'أحدث محاضرة</span><span class="lc-play">' + IC.play + '</span></button>' +
      '<div class="lc-ft__b"><h2>' + t + '</h2><div class="lc-m">' + (g ? '<span>' + IC.cap + esc(g) + '</span>' : '') + (hb ? '<span>' + bic(l.branch) + esc(l.branch) + '</span>' : '') + (d ? '<span>' + IC.cal + esc(d) + '</span>' : '') + '</div>' +
      '<button class="lc-go" type="button" data-id="' + id + '"><span>شاهد الآن</span>' + IC.arrow + '</button></div></article>';
  }
  function render() {
    var list = visible();
    $('lcHeadT').textContent = grade === 'all' ? 'كل المحاضرات' : LBL[grade];
    $('lcCount').textContent = list.length ? 'عرض ' + ar(list.length) + ' من ' + ar(all.length) + ' محاضرة' : '';
    $('lcGrid').innerHTML = list.length ? list.map(card).join('') :
      '<div class="st"><span class="ic">' + IC.book + '</span><h3>' + (all.length ? 'لا توجد نتائج مطابقة' : 'لا توجد محاضرات حتى الآن') + '</h3><p>' + (all.length ? 'جرّب تغيير الصف أو كلمة البحث.' : 'ستظهر المحاضرات هنا فور نشرها من لوحة التحكم، تابعنا!') + '</p></div>';
  }
  function stats() {
    var el = $('lcStats'); el.hidden = !all.length; if (!all.length) return;
    var gs = {}, bs = {}; all.forEach(function (l) { if (l.grade) gs[l.grade] = 1; if (l.branch && l.branch !== 'عام') bs[l.branch] = 1; });
    var ng = Object.keys(gs).length, nb = Object.keys(bs).length;
    el.innerHTML = '<span>' + IC.play + '<b>' + ar(all.length) + '</b> ' + (all.length === 1 ? 'محاضرة' : 'محاضرات') + '</span><span>' + IC.cap + '<b>' + ar(ng) + '</b> ' + (ng === 1 ? 'صف دراسي' : 'صفوف دراسية') + '</span>' +
      (nb ? '<span>' + IC.book + '<b>' + ar(nb) + '</b> ' + (nb === 1 ? 'فرع' : 'فروع') + '</span>' : '');
  }
  function paint(r) {
    all = clean(r.items);
    $('lcNote').innerHTML = r.live ? '' : '<div class="nt">تعذّر الاتصال بالخادم، نعرض آخر نسخة محفوظة على جهازك. تأكد من الإنترنت وأعد تحميل الصفحة.</div>';
    stats(); feat(); tabs(); chips(); render();
    var m = /^#v=([\w-]{11})$/.exec(location.hash);
    if (m && $('lm').hidden) { var f = all.filter(function (l) { return l.yt === m[1]; })[0]; if (f) open(f); }
  }

  /* ---------- المشغّل ---------- */
  // منع الخروج إلى يوتيوب (نفس قيود مشغّل الدروس في course-lessons.js):
  //  • sandbox بلا allow-popups ولا allow-top-navigation → ضغط الطالب على شعار يوتيوب أو عنوان الفيديو داخل المشغّل لا يفتح تبويبًا جديدًا ولا ينقل المنصة.
  //  • allow بلا clipboard-write → زر «نسخ الرابط» داخل المشغّل لا يستطيع نسخ رابط الفيديو الأصلي.
  // أزرار المشغّل وملء الشاشة الأصلية من يوتيوب تعمل كما هي. لإلغاء القيد ضع YT_SANDBOX = ''.
  // ملاحظة: شعار يوتيوب وعنوان الفيديو داخل الـ iframe لا يمكن إخفاؤهما بأي بارامتر رسمي (modestbranding أُلغي منذ 2023).
  var YT_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-orientation-lock';
  var YT_ALLOW = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
  function open(l) {
    opener = document.activeElement;
    $('lmT').textContent = l.title;
    $('lmMeta').textContent = [LBL[l.grade], l.branch && l.branch !== 'عام' ? l.branch : '', l.note].filter(Boolean).join(' · ');
    $('lmStage').innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + l.yt + '?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1" title="' + esc(l.title) + '" allow="' + YT_ALLOW + '" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"' + (YT_SANDBOX ? ' sandbox="' + YT_SANDBOX + '"' : '') + '></iframe>';
    $('lm').hidden = false; document.body.style.overflow = 'hidden'; $('lmX').focus();
    try { history.replaceState(null, '', '#v=' + l.yt); } catch (e) { }
  }
  function close() {
    if ($('lm').hidden) return;
    $('lm').hidden = true; $('lmStage').innerHTML = ''; document.body.style.overflow = '';
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    if (opener && opener.focus) opener.focus();
  }

  /* ---------- أحداث ---------- */
  $('lcTabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-g]'); if (!b) return; grade = b.dataset.g; branch = ''; tabs(); chips(); render(); });
  $('lcBranches').addEventListener('click', function (e) { var b = e.target.closest('button[data-b]'); if (!b) return; branch = b.dataset.b; chips(); render(); });
  $('lcQ').addEventListener('input', function (e) { q = e.target.value; render(); });
  function pick(e) {
    var b = e.target.closest('[data-id]'); if (!b) return;
    var l = all.filter(function (x) { return x.id === b.dataset.id; })[0]; if (l) open(l);
  }
  $('lcGrid').addEventListener('click', pick);
  $('lcFeat').addEventListener('click', pick);
  $('lmX').addEventListener('click', close);
  $('lm').addEventListener('click', function (e) { if (e.target === $('lm')) close(); });
  document.addEventListener('keydown', function (e) {
    if ($('lm').hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { var f = [$('lmX')].filter(function (x) { return x.offsetParent !== null; }), i = f.indexOf(document.activeElement); e.preventDefault(); if (f.length) f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }
  });
  var g0 = new URLSearchParams(location.search).get('grade'); if (g0 && LBL[gcode(g0)]) grade = gcode(g0);

  /* ---------- تشغيل + متابعة لحظية لما تنشره لوحة التحكم ---------- */
  function failed() {
    $('lcNote').innerHTML = '';
    $('lcGrid').innerHTML = '<div class="st"><span class="ic">' + IC.book + '</span><h3>تعذّر تحميل المحاضرات الآن</h3><p>تأكد من اتصالك بالإنترنت. نواصل المحاولة تلقائيًا وستظهر المحاضرات فور عودة الاتصال.</p><button type="button" class="btn b1" onclick="location.reload()">إعادة المحاولة</button></div>';
  }
  if (window.AlaminData) {
    window.AlaminData.lectures.subscribe(function (p) {
      if (!p.hasData) { if (p.state !== 'loading') failed(); return; }
      paint({ items: p.data, live: p.ok });
    });
  } else paint({ items: readLocal(), live: false }); // احتياطي: لو لم يُحمَّل platform-data.js
})();
/* الهيدر: لو الزائر طالب مسجَّل دخوله يظهر اسمه بدل أزرار الدخول (نفس سلوك صفحة الاختبارات). الصفحة نفسها تبقى عامة. */
(function () { if (window.StudentSession) window.StudentSession.resolve().then(window.StudentSession.paint).catch(function () { }); })();
