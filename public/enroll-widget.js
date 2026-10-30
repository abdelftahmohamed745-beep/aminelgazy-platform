/* ============================================================
   enroll-widget.js — تفعيل الاشتراكات بكود (ملف الطالب)
   يظهر فقط للطلاب المسجّلين، ويتحدّث مع الخادم المحلي مباشرة.
   ============================================================ */
(function () {
  'use strict';
  var section = document.getElementById('enrollSec');
  var form = document.getElementById('enrForm');
  if (!section || !form) return;

  var input = document.getElementById('enrCode');
  var errEl = document.getElementById('enrErr');
  var msgEl = document.getElementById('enrMsg');
  var listEl = document.getElementById('enrList');
  var btn = form.querySelector('button[type=submit]');
  var me = null;
  var courses = [];
  var enrolled = [];
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normalizeCode(v) {
    return String(v || '').trim()
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .toUpperCase();
  }
  function setErr(m) {
    errEl.textContent = m || '';
    input.setAttribute('aria-invalid', m ? 'true' : 'false');
    form.querySelector('.enr-row').classList.toggle('bad', !!m);
  }
  function showMsg(html, type) {
    msgEl.hidden = !html;
    msgEl.className = 'gp-msg ' + (type || '');
    msgEl.innerHTML = html || '';
  }
  function titleOf(id) {
    for (var i = 0; i < courses.length; i++) {
      if (String(courses[i] && courses[i].id) === String(id)) return courses[i].title || ('كورس ' + id);
    }
    return 'كورس #' + id;
  }
  function renderList() {
    if (!enrolled.length) {
      listEl.innerHTML = '<li class="none">لا توجد كورسات مفعّلة بعد — فعّل أول كورس بالكود المجاور.</li>';
      return;
    }
    listEl.innerHTML = enrolled.map(function (id) {
      return '<li><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' + esc(titleOf(id)) + '</li>';
    }).join('');
  }
  function refreshList() {
    return fetch('/api/student', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        enrolled = Array.isArray(d.enrolledCourses) ? d.enrolledCourses.map(String) : [];
        renderList();
        return d;
      }).catch(function () { });
  }

  function loadCourses() {
    if (window.AlaminData) {
      return window.AlaminData.courses.once({ timeout: 8000 }).then(function (p) {
        courses = p.hasData ? p.data : [];
      }).catch(function () { });
    }
    return fetch('/api/data/courses', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { courses = d && Array.isArray(d.items) ? d.items : []; })
      .catch(function () { });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    showMsg('');
    var code = normalizeCode(input.value);
    if (!code) { setErr('أدخل كود الاشتراك.'); input.focus(); return; }
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) { setErr('الكود يتكوّن من حروف وأرقام وشرطات فقط.'); input.focus(); return; }
    busy = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    var label = btn.textContent;
    btn.textContent = 'جارٍ التفعيل…';

    fetch('/api/enroll', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
    }).then(function (res) {
      if (!res.ok) {
        if (res.status === 401) {
          showMsg('انتهت جلستك. <a href="auth.html#/login">سجّل الدخول</a> ثم حاول مرة أخرى.', 'bad');
          return;
        }
        setErr(res.d.error || 'تعذّر تفعيل الكود. تحقّق من الكود وحاول مرة أخرى.');
        return;
      }
      var cid = String(res.d.courseId || '');
      var title = res.d.courseTitle || titleOf(cid);
      var already = enrolled.indexOf(cid) > -1;
      // تحديث فوري ثم إعادة تحميل القائمة من الخادم
      if (cid && enrolled.indexOf(cid) < 0) enrolled.push(cid);
      renderList();
      input.value = '';
      if (already) {
        showMsg('هذا الكورس مفعّل بالفعل على حسابك: <b>' + esc(title) + '</b>. <a href="course.html?course=' + encodeURIComponent(cid) + '">افتح الكورس</a>', 'ok');
      } else {
        showMsg('تم تفعيل <b>' + esc(title) + '</b> بنجاح. <a href="course.html?course=' + encodeURIComponent(cid) + '">ابدأ المشاهدة الآن</a>', 'ok');
      }
      if (window.AlaminData && me) {
        try { window.AlaminData.student('students', 'web-' + me.id).refresh(); } catch (x) { }
      }
      refreshList();
    }).catch(function () {
      setErr('تعذّر الاتصال بالخادم. تحقّق من الإنترنت وحاول مرة أخرى.');
    }).finally(function () {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = label;
    });
  });

  input.addEventListener('input', function () {
    if (input.getAttribute('aria-invalid') === 'true') setErr('');
    var v = normalizeCode(input.value).replace(/[^A-Z0-9-]/g, '');
    if (v !== input.value) input.value = v;
  });

  // لا نُظهر الأداة إلا لجلسة طالب صالحة
  fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.status === 401 ? null : (r.ok ? r.json() : null); })
    .then(function (u) {
      if (!u || !u.id) return;
      me = u;
      section.hidden = false;
      Promise.all([loadCourses(), refreshList()]).then(renderList);
    })
    .catch(function () { });
})();
