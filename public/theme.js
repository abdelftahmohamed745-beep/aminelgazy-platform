/* الوضع النهاري/الليلي المشترك لكل صفحات المنصة.
   - يُحمَّل متزامنًا في <head> قبل أول رسم فلا يحدث وميض.
   - الافتراضي لأي زائر جديد: نهاري. لا يتبع إعداد النظام أبدًا ولا يتغيّر إلا بضغطة الطالب على المفتاح.
   - الاختيار محفوظ في localStorage بالمفتاح "theme" (نفس مفتاح لوحة التحكم) مع نسخة كوكي احتياطية، ويُطبَّق فورًا على التبويبات المفتوحة. */
(function (w, d) {
  'use strict';
  var K = 'theme', R = d.documentElement;
  function ok(v) { return v === 'dark' || v === 'light'; }
  function read() {
    var v = null;
    try { v = w.localStorage.getItem(K); } catch (e) { }
    if (!ok(v)) { var m = (d.cookie || '').match(/(?:^|;\s*)theme=(light|dark)/); v = m ? m[1] : null; }
    return ok(v) ? v : null;
  }
  function paint(t) {
    R.setAttribute('data-theme', t); R.style.colorScheme = t;
    var m = d.querySelector('meta[name="color-scheme"]'); if (m) m.setAttribute('content', t);
    var c = d.getElementById('thm'); if (c) c.checked = t === 'dark';
  }
  function save(t) {
    try { w.localStorage.setItem(K, t); } catch (e) { }
    try { d.cookie = 'theme=' + t + ';path=/;max-age=31536000;samesite=lax'; } catch (e) { }
  }
  function set(t) { paint(t); save(t); }
  paint(read() || 'light');
  d.addEventListener('DOMContentLoaded', function () { paint(R.getAttribute('data-theme') || 'light'); });
  /* مفتاح صفحات المنصة: checkbox#thm داخل label.tg (يعمل بالكيبورد أيضًا) */
  d.addEventListener('change', function (e) { var t = e.target; if (t && t.id === 'thm') set(t.checked ? 'dark' : 'light'); });
  /* مفتاح صفحة الدخول: button#tg */
  d.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('button#tg'); if (b) set(R.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
  /* تبويب آخر غيّر الوضع، أو رجوع من الكاش (bfcache) */
  w.addEventListener('storage', function (e) { if (e.key === K && ok(e.newValue)) paint(e.newValue); });
  w.addEventListener('pageshow', function (e) { if (e.persisted) { var t = read(); if (t) paint(t); } });
  w.AlaminTheme = { get: function () { return R.getAttribute('data-theme'); }, set: set };
})(window, document);
