/* exams.js — صفحة الاختبارات المستقلة (قائمة فقط).
   المصدر: نفس بيانات لوحة التحكم — الاختبارات المنشورة (isPublished=true، زر «عرض في المنصة») عبر فهرس الاختبارات الخفيف
   platform_data/quizzes_index الذي تُحدّثه الداشبورد مع كل حفظ/نشر/إخفاء/حذف (احتياطيًا استعلام quizzes المنشورة)، في الطبقة المشتركة
   platform-data.js — قراءة واحدة بدل تنزيل كل الاختبارات بأسئلتها مع كل زيارة. المستمعات كلها مشتركة مع بقية الصفحات.
   تُعرض لطلاب الصف المطابق فقط، وتُستبعد الاختبارات المربوطة بدرس (lesson.quizId داخل platform_data/courses_list).
   النتائج: مجموعة quiz_attempts لنفس الطالب (كما يكتبها test.html).
   لا يوجد هنا أي منطق لحلّ الاختبار أو حفظ النتيجة: الزر يفتح test.html?quiz=<id> وهو المنفّذ الوحيد للحل والتسليم والحفظ.
   أي نشر/إخفاء/تصفير من لوحة التحكم ينعكس هنا لحظيًا دون تحديث. */
(function () {
  'use strict';
  var C = window.AlaminCourses, SS = window.StudentSession, E = C.esc, ar = C.ar, I = C.ICON;
  var $ = function (id) { return document.getElementById(id); };
  var SYS = { 'First Preparatory': 'prep1', 'Second Preparatory': 'prep2', 'Third Preparatory': 'prep3', 'First Secondary': '1', 'Second Secondary – Baccalaureate': '2', 'Third Secondary': '3' };
  var PEND = 'alamin_exam_pending';
  var IC = {
    spark: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/></svg>',
    check: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    cross: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    cap: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 2.5 9.5 12 14.5l9.5-5Z"/><path d="M6.5 12.2V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-3.8"/></svg>',
    target: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/></svg>',
    trend: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>'
  };
  var ME, SID, G, DB, QZ = {}, LINK = {}, SRV = null, warn = {}, ready = { q: 0, c: 0, a: 0 }, first = true;

  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }
  function jget(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function passOf(q) { return num(q.passingGrade, num(q.averageGrade, 50)); }
  function link(id) { return 'test.html?quiz=' + encodeURIComponent(id) + '&from=exams'; }
  function msg(t, h, b) { $('xmApp').innerHTML = '<div class="st"><span class="ic">' + I.quiz + '</span><h3>' + E(t) + '</h3><p>' + E(h || '') + '</p>' + (b || '') + '</div>'; }
  async function waitDb() { for (var i = 0; i < 75 && !window.db; i++) await new Promise(function (r) { setTimeout(r, 80); }); return window.db || null; }

  /* ---------- تصنيف الاختبارات (نفس شروط test.html لاختبارات الصف، بعد استبعاد المربوط بدرس) ---------- */
  function eligible(id, q) {
    return !!q && q.isPublished === true && num(q.qn, 0) > 0 &&
      (q.grade === 'all' || normalizeGrade(q.grade) === G) && !LINK[id];
  }
  function doneMap() {
    var d = SRV || jget('alamin_exam_done_' + SID) || {}, o = {};
    Object.keys(d).forEach(function (k) { o[k] = d[k]; });
    (jget(PEND) || []).forEach(function (r) { if (r && r.studentId === SID && !o[r.quizId]) o[r.quizId] = r; });
    return o;
  }
  function lists() {
    var D = doneMap(), fresh = [], done = [], seen = {};
    Object.keys(QZ).forEach(function (id) {
      if (!eligible(id, QZ[id])) return;
      seen[id] = 1; var x = { id: id, q: QZ[id] };
      if (D[id]) { x.a = D[id]; done.push(x); } else fresh.push(x);
    });
    /* نتيجة اختبار مستقل أُلغي نشره لاحقًا تبقى ظاهرة للطالب (اختبارات الدروس وسجلات الغياب لا تدخل هنا) */
    Object.keys(D).forEach(function (id) {
      var a = D[id];
      if (seen[id] || QZ[id] || LINK[id] || !a || a.status !== 'submitted' || a.source !== 'platform' || a.courseId) return;
      done.push({ id: id, a: a, q: { title: a.quizTitle || 'اختبار', totalPoints: a.totalPoints } });
    });
    var at = function (q) { return String(q.createdAt || q.updatedAt || ''); };
    fresh.sort(function (a, b) { return at(b.q).localeCompare(at(a.q)); });
    done.sort(function (a, b) { return String(b.a.submittedAtIso || '').localeCompare(String(a.a.submittedAtIso || '')); });
    return { fresh: fresh, done: done };
  }

  /* ---------- العرض ---------- */
  function newCard(x, i) {
    var q = x.q, n = q.questionsCount || q.qn || 0, t = num(q.time, 0), sub = q.subject && q.subject !== 'عام' ? q.subject : '';
    return '<article class="xm-card xm-new' + (first ? ' xm-in' : '') + '" style="--i:' + i + '">' +
      '<div class="xm-top"><span class="xm-ribbon">' + IC.spark + 'جديد</span><span class="xm-ico">' + I.quiz + '</span>' + (sub ? '<span class="xm-sub">' + E(sub) + '</span>' : '') + '</div>' +
      '<div class="xm-bd"><h3>' + E(q.title || 'اختبار بدون عنوان') + '</h3><ul class="xm-meta"><li>' + I.quiz + ar(n) + ' سؤال</li>' + (t ? '<li>' + I.clock + ar(t) + ' دقيقة</li>' : '') +
      '<li>' + I.file + ar(num(q.totalPoints, 0)) + ' درجة</li><li>' + IC.target + 'النجاح من ' + ar(passOf(q)) + '٪</li></ul>' +
      '<a class="xm-go" href="' + E(link(x.id)) + '"><span>ابدأ الاختبار الآن</span>' + I.arrow + '</a></div></article>';
  }
  function doneCard(x) {
    var a = x.a, q = x.q, ab = a.status === 'absent', p = num(a.percentage, 0), ok = !!a.passed, k = ab ? ' abs' : ok ? '' : ' bad';
    var vd = ab ? 'غائب' : ok ? 'ناجح' : 'لم تجتز';
    return '<article class="xm-card xm-done' + k + '"><h3>' + E(q.title || 'اختبار') + '</h3>' +
      '<div class="xm-res"><div class="xm-ring' + k + '" style="--p:' + p + '"><b>' + ar(p) + '٪</b></div><div><span class="xm-vd' + k + '">' + (ab ? '' : ok ? IC.check : IC.cross) + vd + '</span>' +
      '<p class="xm-sc">' + ar(num(a.score, 0)) + ' من ' + ar(num(a.totalPoints, 0)) + ' درجة</p></div></div>' +
      (a.submittedAt ? '<p class="xm-when">' + I.clock + E(a.submittedAt) + '</p>' : '') +
      '<a class="xm-view" href="' + E(link(x.id)) + '">عرض النتيجة والمراجعة' + I.arrow + '</a></article>';
  }
  function paint() {
    if (!(ready.q && ready.c && ready.a)) return;
    var L = lists(), avgs = L.done.filter(function (x) { return x.a.status === 'submitted'; });
    var avg = avgs.length ? Math.round(avgs.reduce(function (s, x) { return s + num(x.a.percentage, 0); }, 0) / avgs.length) : 0;
    var st = $('xmStats'); st.hidden = false;
    st.innerHTML = '<span>' + IC.spark + '<b>' + ar(L.fresh.length) + '</b> ' + (L.fresh.length === 1 ? 'اختبار جديد' : 'اختبارات جديدة') + '</span><span>' + IC.check + '<b>' + ar(L.done.length) + '</b> مكتملة</span>' +
      (avgs.length ? '<span>' + IC.trend + 'متوسط درجاتك <b>' + ar(avg) + '٪</b></span>' : '');
    var note = Object.keys(warn).map(function (k) { return '<div class="nt">' + E(warn[k]) + '</div>'; }).join('');
    var freshHtml = L.fresh.length ? L.fresh.map(newCard).join('') :
      '<div class="st xm-empty"><span class="ic">' + I.quiz + '</span><h3>لا توجد اختبارات جديدة الآن</h3><p>سيظهر هنا أي اختبار جديد لصفك فور نشره من مستر أمين.</p></div>';
    var doneHtml = L.done.length ? L.done.map(doneCard).join('') :
      '<div class="st xm-empty"><span class="ic">' + I.quiz + '</span><h3>لم تُكمل أي اختبار بعد</h3><p>ستظهر نتائجك هنا بعد تسليم أول اختبار.</p></div>';
    $('xmApp').innerHTML = note +
      '<section class="xm-block" aria-labelledby="xmN"><div class="xm-h"><h2 id="xmN">اختبارات جديدة</h2><span class="cnt">' + ar(L.fresh.length) + '</span><p>اختبارات نشرها مستر أمين لصفّك ولم تحلّها بعد.</p></div><div class="xm-grid">' + freshHtml + '</div></section>' +
      '<section class="xm-block" aria-labelledby="xmD"><div class="xm-h"><h2 id="xmD">اختباراتك المكتملة</h2><span class="cnt">' + ar(L.done.length) + '</span><p>نتائجك السابقة، ويمكنك فتح أي نتيجة لمراجعة إجاباتك.</p></div><div class="xm-grid">' + doneHtml + '</div></section>';
    first = false;
  }

  /* ---------- الاشتراك في البيانات (لحظيًا) عبر الطبقة المشتركة ---------- */
  function start() {
    var AD = window.AlaminData;
    /* فهرس الاختبارات المنشورة: بيانات خفيفة (العنوان/الوقت/الدرجات/عدد الأسئلة) بدون الأسئلة نفسها */
    AD.quizzes.subscribe(function (p) {
      if (!p.hasData && p.state === 'loading') return;
      QZ = {}; ((p.data && p.data.items) || []).forEach(function (m) { if (m.isPublished === true) QZ[m.id] = m; });
      if (p.ok) delete warn.q; else warn.q = 'تعذّر تحميل الاختبارات المنشورة. تأكد من الإنترنت وسنعيد المحاولة تلقائيًا.';
      ready.q = 1; paint();
    });
    /* الكورسات لمعرفة أي اختبار مربوط بدرس فيُستبعد من هذه الصفحة */
    C.watch(function (r) {
      if (!r.hasData && r.state === 'loading') return;
      LINK = {};
      (r.courses || []).forEach(function (c) { C.lessonsOf(c).forEach(function (l) { if (l && l.quizId != null && l.quizId !== '') LINK[String(l.quizId)] = 1; }); });
      if (!r.live) warn.c = 'تعذّر تحديث بيانات الكورسات؛ قد يظهر هنا اختبار مربوط بدرس حتى يعود الاتصال.'; else delete warn.c;
      ready.c = 1; paint();
    });
    /* نتائج هذا الطالب فقط */
    AD.attempts(SID).subscribe(function (p) {
      if (!p.hasData && p.state === 'loading') return;
      SRV = p.hasData ? p.data : null;
      if (p.ok) delete warn.a; else warn.a = 'تعذّر التحقق من نتائجك المسجّلة؛ نعرض آخر نسخة محفوظة على جهازك.';
      ready.a = 1; paint();
    });
  }

  (async function () {
    var u = await SS.resolve({ refresh: false });
    if (!u || u === 401) return msg('سجّل الدخول لعرض اختباراتك', 'الاختبارات تظهر لطلاب كل صف بعد تسجيل الدخول.', '<a class="btn b1" href="auth.html#/login">تسجيل الدخول</a>');
    ME = u; SID = u.local ? String(u.id) : 'web-' + u.id; G = SYS[u.grade] || normalizeGrade(u.grade);
    SS.paint(u);
    $('xmLead').textContent = 'اختبارات ' + (gradeLabel(G) || 'صفّك') + ' التي ينشرها مستر أمين، ثم نتائجك السابقة — كل شيء في مكان واحد.';
    DB = await waitDb();
    if (!DB) return msg('تعذّر الاتصال بقاعدة البيانات', 'تأكد من الإنترنت وأعد تحميل الصفحة.', '<a class="btn b1" href="">إعادة المحاولة</a>');
    start();
  })();
})();
