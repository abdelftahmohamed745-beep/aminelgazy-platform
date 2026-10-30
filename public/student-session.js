/* جلسة الطالب المشتركة بين صفحات الاختبارات والمحاضرات.
   نفس منطق الدخول الذي كان داخل test.html: خادم Node (/api/me) أولًا، ثم جلسة localStorage 'alamin_current' على الاستضافة الثابتة. */
(function (w) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* لا يُحفظ في المتصفح أبدًا: كود السنتر أو أي كلمة مرور. الهوية الدائمة هي كوكي الجلسة HttpOnly من الخادم. */
  var SECRET = ['centerCode', 'qrCode', 'offlineCode', 'code', 'password', 'pin', 'passcode'];
  function clean(o) { var c = Object.assign({}, o); SECRET.forEach(function (k) { delete c[k]; }); return c; }
  function store(o) { try { localStorage.setItem('alamin_current', JSON.stringify(clean(o))); } catch (e) { } }
  function clearLocal() { try { var l = savedStudent(); if (l) localStorage.removeItem('alamin_current'); } catch (e) { } }
  async function me() { try { var r = await fetch('/api/me', { credentials: 'same-origin' }); if (r.status === 401) return 401; if (!r.ok) return 0; var d = await r.json(); if (!d || !d.id) return 401; return d; } catch (e) { return 0; } }
  function savedStudent() {
    try {
      var l = JSON.parse(localStorage.getItem('alamin_current') || 'null'); return l && l.role === 'student' ? l : null;
    } catch (e) { return null; }
  }
  function localMe() {
    var l = savedStudent(); if (!l) return null;
    var id = String(l.id || l.phone || l.email || l.name || ''); if (!id) return null;
    return { id: id, full_name: String(l.name || l.fullName || l.full_name || l.firstName || 'طالب'), phone: String(l.phone || l.mobile || l.phoneNumber || l.studentPhone || ''), parent_phone: String(l.parentPhone || l.parent_phone || l.guardianPhone || ''), grade: l.grade || l.offlineGrade || '', account_type: l.type || l.studentType || null, code: String(l.qrCode || l.centerCode || l.offlineCode || l.code || ''), collection: l.studentCollection || (l.type === 'center' || l.centerCode ? 'centerStudents' : 'students'), local: 1 };
  }
  /* تحديث نسخة الطالب المحلية من سجله في Firestore. كان يقرأ مستند الطالب مع كل صفحة تُفتح؛ الآن مرة كل ٥ دقائق كحد أقصى
     (الاشتراكات/الاسم يتحدّثان لحظيًا في صفحة الملف الشخصي عبر مستمع المستند نفسه، فالقراءة مشتركة بينهما). */
  var REFRESH_MS = 5 * 60 * 1000;
  async function refreshLocalMe() {
    var raw = savedStudent(), current = localMe();
    if (!raw || !current || !w.db || !current.collection) return current;
    var tsKey = 'alamin_me_ts_' + current.collection + '_' + current.id;
    try { if (Date.now() - Number(localStorage.getItem(tsKey) || 0) < REFRESH_MS) return current; } catch (e) { }
    try {
      var id = String(current.id), data = null;
      if (w.AlaminData) {
        var p = await w.AlaminData.student(current.collection, id).once({ timeout: 8000 });
        if (!p.live || !p.data || !Object.keys(p.data).length) return current;
        data = p.data;
      } else {
        var snap = await w.db.collection(current.collection).doc(id).get();
        if (!snap.exists) return current;
        data = snap.data() || {};
      }
      store(Object.assign({}, raw, data, { id: id, role: 'student', type: raw.type || 'center', studentType: raw.studentType || 'center', studentCollection: current.collection }));
      try { localStorage.setItem(tsKey, String(Date.now())); } catch (e) { }
      return localMe();
    } catch (e) { return current; }
  }
  /* الطالب الحالي أو null (بدون التمييز بين «غير مسجَّل» و«تعذّر الاتصال») */
  /* دخول قديم محفوظ محليًا (كان يحتوي الكود): يُحوَّل مرة واحدة إلى جلسة خادم ثم يُحذف الكود من المتصفح. */
  async function migrate() {
    var l = savedStudent(), code = l ? String(l.qrCode || l.centerCode || l.offlineCode || l.code || '') : '';
    if (!code) return null;
    try {
      var r = await fetch('/api/center-session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
      var d = await r.json().catch(function () { return null; });
      if (r.ok && d && d.ok) { store(d.student); var u = await me(); return u && u !== 401 ? u : localMe(); }
      return r.status === 404 || r.status === 403 || r.status === 409 ? null : localMe(); /* سجل محذوف/موقوف => خروج؛ عطل مؤقت => نكمل من النسخة المحلية */
    } catch (e) { return localMe(); }
  }
  /* 401 = الخادم يعمل ولا توجد جلسة صالحة (انتهت/أُلغيت/خروج): لا نعتمد على نسخة المتصفح. غير ذلك (استضافة ثابتة/بدون اتصال): نسخة محلية بلا أكواد. */
  async function resolve(opts) {
    var u = await me();
    if (u === 401) { var m = await migrate(); if (m) return m; clearLocal(); return null; }
    if (!u) { var l = opts && opts.refresh === false ? localMe() : await refreshLocalMe(); if (l) u = l; } /* refresh:false = بدون قراءة Firestore إضافية (صفحات الاختبارات) */
    return u || null;
  }
  async function logout() { try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { } try { localStorage.removeItem('alamin_current'); } catch (e) { } }
  /* يستبدل أزرار «تسجيل الدخول / أنشئ حسابك» في الهيدر (#acct) باسم الطالب ورابط لوحته */
  function paint(u) {
    var el = document.getElementById('acct'); if (!el || !u) return;
    var href = 'profile.html';
    el.innerHTML = '<a class="hl" href="' + href + '"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>' + esc(String(u.full_name).split(' ')[0]) + '</a>';
  }
  w.StudentSession = { me: me, localMe: localMe, resolve: resolve, paint: paint, clean: clean, store: store, logout: logout };
})(window);
