'use strict';
/*
 * فحص دخان سريع: يشغّل الخادم على منفذ عشوائي وملف حالة مؤقت،
 * ثم يتحقق من الصفحات وواجهات API الأساسية دون المساس ببيانات المشروع.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE_FILE = path.join(os.tmpdir(), `aminelgazy-smoke-${process.pid}.json`);
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !extra ? '' : ` — ${extra}`}`);
  if (!ok) failures++;
}

async function waitForServer(child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('انتهت عملية الخادم مبكرًا');
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch (e) { /* لم يجهز بعد */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('انتهت مهلة انتظار الخادم');
}

async function main() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', STATE_FILE },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });

  try {
    await waitForServer(child);

    const health = await (await fetch(`${BASE}/api/health`)).json();
    check('health ok', health.ok === true);
    check('storage mode file', health.storage && health.storage.mode === 'file');

    const home = await fetch(`${BASE}/`);
    const homeHtml = await home.text();
    check('home 200', home.status === 200);
    check('home RTL + title', homeHtml.includes('dir="rtl"') && homeHtml.includes('أمين'));

    for (const page of ['courses.html', 'lectures.html', 'exam.html', 'auth.html', 'profile.html', 'course.html', 'faq.html', 'contact.html']) {
      const r = await fetch(`${BASE}/${page}`);
      check(`page ${page}`, r.status === 200);
    }

    const courses = await (await fetch(`${BASE}/api/data/courses`)).json();
    check('courses data', Array.isArray(courses.items) && courses.items.length === 9, `count=${courses.items && courses.items.length}`);

    const lectures = await (await fetch(`${BASE}/api/data/lectures`)).json();
    check('lectures data', Array.isArray(lectures.lectures) && lectures.lectures.length === 34, `count=${lectures.lectures && lectures.lectures.length}`);

    const quizzes = await (await fetch(`${BASE}/api/data/quizzes`)).json();
    check('quizzes data', Array.isArray(quizzes.items) && quizzes.items.length === 5, `count=${quizzes.items && quizzes.items.length}`);

    const guestMe = await fetch(`${BASE}/api/me`);
    check('guest /api/me is null', (await guestMe.json()) === null);
    check('guest /api/student 401', (await fetch(`${BASE}/api/student`)).status === 401);

    const login = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01000000000', password: '246810' })
    });
    const loginBody = await login.json();
    check('demo login', login.status === 200 && loginBody.ok === true);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

    const student = await (await fetch(`${BASE}/api/student`, { headers: { cookie } })).json();
    check('student enrolled', student.enrolledCourses && student.enrolledCourses.includes('1788215964547'));

    const attempts = await (await fetch(`${BASE}/api/attempts`, { headers: { cookie } })).json();
    check('attempts data', Array.isArray(attempts.items) && attempts.items.length >= 1);

    const badLogin = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01000000000', password: '000000' })
    });
    check('wrong password 401', badLogin.status === 401);

    const missing = await fetch(`${BASE}/no-such-page`);
    check('404 status', missing.status === 404);
    check('404 page', (await missing.text()).includes('404'));

    const healthAgain = await (await fetch(`${BASE}/api/health`)).json();
    check('health stable', healthAgain.ok === true);
  } finally {
    child.kill('SIGTERM');
    try { fs.unlinkSync(STATE_FILE); } catch (e) {}
  }

  if (stderr.trim()) console.log('\n--- stderr ---\n' + stderr.trim());
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('SMOKE TEST ERROR:', err.message);
  process.exit(1);
});
