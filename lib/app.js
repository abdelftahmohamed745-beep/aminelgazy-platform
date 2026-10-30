'use strict';
/*
 * منصة مستر أمين الغازي — نواة التطبيق بلا اعتماديات خارجية.
 * تعمل محليًا عبر node:http، وعلى Vercel عبر api/[...path].js.
 * التخزين قابل للتبديل: ملف محلي، أو Upstash/Vercel KV، أو ذاكرة مؤقتة.
 */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const store = require('./store').createStore();
const SESSION_COOKIE = 'alamin_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 يومًا

const GRADES = [
  'First Preparatory',
  'Second Preparatory',
  'Third Preparatory',
  'First Secondary',
  'Second Secondary – Baccalaureate',
  'Third Secondary'
];

const GRADE_CODE = {
  'First Preparatory': 'prep1',
  'Second Preparatory': 'prep2',
  'Third Preparatory': 'prep3',
  'First Secondary': '1',
  'Second Secondary – Baccalaureate': '2',
  'Third Secondary': '3',
  prep1: 'prep1', prep2: 'prep2', prep3: 'prep3',
  '1': '1', '2': '2', '3': '3'
};

// أكواد سنتر تجريبية للاستعراض المحلي (ليست بيانات طلاب حقيقيين).
const CENTER_STUDENTS = {
  'AMIN-CENTER-1': {
    id: 'CENTER-1',
    fullName: 'سارة محمود',
    phone: '01000000001',
    parentPhone: '01000000002',
    grade: 'First Secondary',
    accountType: 'center',
    enrolledCourses: ['1785371148630']
  },
  'AMIN-CENTER-2': {
    id: 'CENTER-2',
    fullName: 'يوسف أحمد',
    phone: '01000000003',
    parentPhone: '01000000004',
    grade: 'Third Secondary',
    accountType: 'center',
    enrolledCourses: ['1788215964547']
  }
};

// أكواد تفعيل الاشتراك المحلية. كل كود يفتح كورسًا واحدًا.
const ENROLL_CODES = {
  'AMIN-ADAB': '1788215964547',
  'AMIN-NAHW3': '1788849262859',
  'AMIN-NAHW5': '1791465965486',
  'AMIN-BAL2': '1786697307017',
  'AMIN-NAHW1': '1785170811082',
  'AMIN-TASIS': '1786865438148'
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
};

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

const coursesData = readJSON(path.join(DATA_DIR, 'courses.json'), { items: [] });
const lecturesData = readJSON(path.join(DATA_DIR, 'lectures.json'), { lectures: [] });
const quizIndex = readJSON(path.join(DATA_DIR, 'quizzes-index.json'), { items: [] });
const quizBank = readJSON(path.join(DATA_DIR, 'quizzes-full.json'), {});

const quizById = new Map();
for (const q of Object.values(quizBank)) quizById.set(String(q.id), q);
for (const q of quizIndex.items) if (!quizById.has(String(q.id))) quizById.set(String(q.id), q);

const courseById = new Map(coursesData.items.map(c => [String(c.id), c]));

let state = { users: [], sessions: {}, attempts: [], messages: [], nextUserId: 1 };
let dirty = false;

// كل تعديل يمرّ من هنا: ملف محلي يُحفظ بعد 120ms، وKV يُحفظ بنهاية الطلب.
function persist() {
  dirty = true;
  store.scheduleWrite(() => state);
}

function nowISO() { return new Date().toISOString(); }

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}
function verifyPassword(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token, maxAge = SESSION_MAX_AGE) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = state.sessions[token];
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_MAX_AGE * 1000) {
    delete state.sessions[token];
    persist();
    return null;
  }
  return state.users.find(u => u.id === session.userId) || null;
}

function publicStudent(user) {
  return {
    id: user.id,
    full_name: user.fullName,
    phone: user.phone,
    parent_phone: user.parentPhone || '',
    grade: user.grade,
    account_type: user.accountType || 'external',
    code: user.centerCode || ''
  };
}

function studentSideId(user) {
  return 'web-' + user.id;
}

function sendJSON(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(data);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('body-too-large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(Object.assign(new Error('bad-json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function normalizePhone(v) { return String(v == null ? '' : v).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim(); }
function normalizeCode(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function gradeCode(grade) { return GRADE_CODE[String(grade == null ? '' : grade).trim()] || String(grade || '').trim(); }

const PHONE_RE = /^01[0125]\d{8}$/;
const NAME_RE = /^[\p{L}][\p{L}\s'.-]*$/u;

function validateRegistration(body) {
  const fields = {};
  const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
  const phone = normalizePhone(body.phone);
  const parentPhone = normalizePhone(body.parentPhone);
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const grade = String(body.grade || '');

  if (!fullName) fields.fullName = 'أدخل اسمك بالكامل.';
  else if (fullName.split(/\s+/).length < 2) fields.fullName = 'أدخل اسمك الأول والأخير على الأقل.';
  else if (!NAME_RE.test(fullName)) fields.fullName = 'يجب أن يحتوي الاسم على حروف فقط.';

  if (!phone) fields.phone = 'أدخل رقم هاتفك.';
  else if (!/^\d+$/.test(phone)) fields.phone = 'استخدم أرقامًا فقط (0–9) دون حروف أو رموز.';
  else if (phone.length !== 11) fields.phone = 'يجب أن يتكوّن الرقم من 11 رقمًا بالضبط.';
  else if (!PHONE_RE.test(phone)) fields.phone = 'أدخل رقم موبايل مصريًا صحيحًا يبدأ بـ 010 أو 011 أو 012 أو 015.';
  else if (state.users.some(u => u.phone === phone)) fields.phone = 'هذا الرقم مسجّل بالفعل. سجّل الدخول بدلًا من ذلك.';

  if (!parentPhone) fields.parentPhone = 'أدخل رقم هاتف ولي الأمر.';
  else if (!/^\d+$/.test(parentPhone)) fields.parentPhone = 'استخدم أرقامًا فقط (0–9) دون حروف أو رموز.';
  else if (parentPhone.length !== 11) fields.parentPhone = 'يجب أن يتكوّن الرقم من 11 رقمًا بالضبط.';
  else if (!PHONE_RE.test(parentPhone)) fields.parentPhone = 'أدخل رقم موبايل مصريًا صحيحًا يبدأ بـ 010 أو 011 أو 012 أو 015.';

  if (!password) fields.password = 'أدخل كلمة مرور من 6 أرقام.';
  else if (!/^\d+$/.test(password)) fields.password = 'يجب أن تحتوي كلمة المرور على أرقام فقط.';
  else if (password.length !== 6) fields.password = 'يجب أن تتكوّن كلمة المرور من 6 أرقام بالضبط.';

  if (!confirmPassword) fields.confirmPassword = 'أكّد كلمة المرور.';
  else if (confirmPassword !== password) fields.confirmPassword = 'كلمتا المرور غير متطابقتين.';

  if (!GRADES.includes(grade)) fields.grade = 'اختر الصف الدراسي.';

  return { fields, fullName, phone, parentPhone, password, grade, accountType: body.accountType === 'center' ? 'center' : 'external' };
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  state.sessions[token] = { userId: user.id, createdAt: Date.now() };
  persist();
  return token;
}

function loginResponse(res, user) {
  const token = createSession(user);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`);
  sendJSON(res, 200, { ok: true, student: publicStudent(user), redirect: 'index.html' });
}

function attemptsFor(user) {
  const sid = studentSideId(user);
  return state.attempts.filter(a => a.studentId === sid);
}

function attemptMap(user) {
  const out = {};
  for (const a of attemptsFor(user)) {
    if (a && a.quizId != null) out[String(a.quizId)] = a;
  }
  return out;
}

function canAccessQuiz(user, quiz) {
  if (!quiz || quiz.isPublished !== true) return false;
  const g = gradeCode(quiz.grade);
  if (quiz.grade === 'all' || g === 'all') return true;
  return g === gradeCode(user.grade);
}

function quizMeta(q) {
  return {
    id: String(q.id),
    title: q.title || '',
    grade: q.grade == null ? '' : q.grade,
    subject: q.subject || '',
    time: q.time,
    questionsCount: q.questionsCount,
    qn: typeof q.qn === 'number' ? q.qn : (Array.isArray(q.questionsList) ? q.questionsList.length : 0),
    totalPoints: q.totalPoints,
    averageGrade: q.averageGrade,
    passingGrade: q.passingGrade,
    isPublished: q.isPublished === true,
    createdAt: q.createdAt || '',
    updatedAt: q.updatedAt || ''
  };
}

function computeAttempt(quiz, rec) {
  const questions = Array.isArray(quiz.questionsList) ? quiz.questionsList : [];
  const answers = Array.isArray(rec.answers) ? rec.answers : [];
  let score = 0, sum = 0;
  questions.forEach((q, i) => {
    const points = Number.isFinite(Number(q.points)) ? Number(q.points) : 1;
    sum += points;
    const chosen = answers[i] === undefined ? -1 : Number(answers[i]);
    if (chosen >= 0 && chosen === Number(q.correctOpt)) score += points;
  });
  const total = Number(quiz.totalPoints) || sum || 1;
  const percentage = Math.round((score / total) * 100);
  const pass = Number(quiz.passingGrade ?? quiz.averageGrade ?? 50);
  return { score, totalPoints: total, percentage, passed: score >= total * (pass / 100) };
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (p === '/api/health' && method === 'GET') {
    return sendJSON(res, 200, {
      ok: true,
      service: 'aminelgazy-platform',
      storage: store.describe(),
      time: nowISO()
    });
  }

  if (p === '/api/data/courses' && method === 'GET') {
    return sendJSON(res, 200, coursesData);
  }
  if (p === '/api/data/lectures' && method === 'GET') {
    return sendJSON(res, 200, lecturesData);
  }
  if (p === '/api/data/quizzes' && method === 'GET') {
    return sendJSON(res, 200, { items: quizIndex.items.map(q => quizMeta(quizById.get(String(q.id)) || q)) });
  }

  if (p === '/api/me' && method === 'GET') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 200, null); /* 200 + null بدل 401: لا يظهر خطأ في وحدة التحكم للزائر */
    return sendJSON(res, 200, publicStudent(user));
  }

  if (p === '/api/register' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'تعذّر قراءة البيانات المرسلة.' }); }
    const v = validateRegistration(body);
    if (Object.keys(v.fields).length) {
      return sendJSON(res, 400, { ok: false, error: 'تحقّق من الحقول المظللة ثم حاول مرة أخرى.', fields: v.fields });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: state.nextUserId++,
      fullName: v.fullName,
      phone: v.phone,
      parentPhone: v.parentPhone,
      grade: v.grade,
      accountType: v.accountType,
      salt,
      passwordHash: hashPassword(v.password, salt),
      enrolledCourses: [],
      createdAt: nowISO()
    };
    state.users.push(user);
    persist();
    return loginResponse(res, user);
  }

  if (p === '/api/login' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'تعذّر قراءة البيانات المرسلة.' }); }
    const phone = normalizePhone(body.phone);
    const password = String(body.password || '');
    const user = state.users.find(u => u.phone === phone);
    if (!user || !verifyPassword(password, user)) {
      return sendJSON(res, 401, { ok: false, error: 'رقم الهاتف أو كلمة المرور غير صحيحة.' });
    }
    return loginResponse(res, user);
  }

  if (p === '/api/center-session' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'تعذّر قراءة البيانات المرسلة.' }); }
    const code = normalizeCode(body.code);
    const center = CENTER_STUDENTS[code];
    if (!center) {
      return sendJSON(res, 404, { ok: false, error: 'كود الطالب غير صحيح أو غير مسجّل. تأكد من الكود وحاول مرة أخرى.' });
    }
    let user = state.users.find(u => u.centerCode === code);
    if (!user) {
      const salt = crypto.randomBytes(16).toString('hex');
      user = {
        id: state.nextUserId++,
        fullName: center.fullName,
        phone: center.phone,
        parentPhone: center.parentPhone,
        grade: center.grade,
        accountType: 'center',
        centerCode: code,
        salt,
        passwordHash: hashPassword(crypto.randomBytes(6).toString('hex'), salt),
        enrolledCourses: center.enrolledCourses.slice(),
        createdAt: nowISO()
      };
      state.users.push(user);
      persist();
    } else {
      user.enrolledCourses = Array.from(new Set([...(user.enrolledCourses || []), ...center.enrolledCourses]));
      persist();
    }
    return loginResponse(res, user);
  }

  if (p === '/api/logout' && method === 'POST') {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token && state.sessions[token]) {
      delete state.sessions[token];
      persist();
    }
    setSessionCookie(res, '', 0);
    return sendJSON(res, 200, { ok: true });
  }

  if (p === '/api/student' && method === 'GET') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
    return sendJSON(res, 200, {
      id: user.id,
      full_name: user.fullName,
      phone: user.phone,
      parent_phone: user.parentPhone || '',
      grade: user.grade,
      account_type: user.accountType || 'external',
      enrolledCourses: user.enrolledCourses || []
    });
  }

  if (p === '/api/enroll' && method === 'POST') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 401, { ok: false, error: 'سجّل الدخول أولًا لتفعيل كود الاشتراك.' });
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'تعذّر قراءة البيانات المرسلة.' }); }
    const code = normalizeCode(body.code);
    const courseId = ENROLL_CODES[code];
    const course = courseId && courseById.get(String(courseId));
    if (!course) return sendJSON(res, 404, { ok: false, error: 'كود الاشتراك غير صحيح. راجع الكود مع إدارة المنصة.' });
    user.enrolledCourses = Array.from(new Set([...(user.enrolledCourses || []), String(courseId)]));
    persist();
    return sendJSON(res, 200, {
      ok: true,
      courseId: String(courseId),
      courseTitle: course.title || '',
      enrolledCourses: user.enrolledCourses
    });
  }

  if (p === '/api/attempts' && method === 'GET') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
    return sendJSON(res, 200, { items: attemptsFor(user) });
  }

  if (p === '/api/attempts/doc' && method === 'GET') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
    const id = String(url.searchParams.get('id') || '');
    const found = attemptsFor(user).find(a => `ATT_${a.studentId}_${a.quizId}` === id);
    return sendJSON(res, 200, found ? { exists: true, data: found } : { exists: false });
  }

  if (p === '/api/attempts' && method === 'POST') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'تعذّر قراءة البيانات المرسلة.' }); }
    const rec = body && body.rec ? body.rec : body;
    const quizId = String(rec.quizId || '');
    const quiz = quizById.get(quizId);
    if (!quiz) return sendJSON(res, 404, { ok: false, error: 'الاختبار غير موجود.' });
    if (!canAccessQuiz(user, quiz)) return sendJSON(res, 403, { ok: false, error: 'هذا الاختبار غير متاح لحسابك.' });
    const sid = studentSideId(user);
    const existing = state.attempts.find(a => a.studentId === sid && String(a.quizId) === quizId);
    if (existing && (existing.status === 'submitted' || existing.status === 'absent')) {
      return sendJSON(res, 409, { ok: false, error: 'تم تسليم هذا الاختبار من قبل.', attempt: existing });
    }
    const calc = computeAttempt(quiz, rec);
    const attempt = {
      studentId: sid,
      studentName: user.fullName,
      studentCode: user.phone,
      quizId,
      quizTitle: quiz.title || rec.quizTitle || '',
      grade: quiz.grade == null ? gradeCode(user.grade) : quiz.grade,
      status: 'submitted',
      score: calc.score,
      totalPoints: calc.totalPoints,
      percentage: calc.percentage,
      passed: calc.passed,
      startedAt: rec.startedAt || '',
      submittedAt: rec.submittedAt || new Date().toLocaleString('ar-EG'),
      submittedAtIso: rec.submittedAtIso || nowISO(),
      elapsedTime: Number(rec.elapsedTime) || 0,
      answers: Array.isArray(rec.answers) ? rec.answers : [],
      courseId: rec.courseId || null,
      lessonId: rec.lessonId || null,
      lessonTitle: rec.lessonTitle || null,
      accountType: user.accountType || null,
      source: 'platform'
    };
    state.attempts.push(attempt);
    persist();
    return sendJSON(res, 200, { ok: true, attempt });
  }

  const qm = /^\/api\/quizzes\/([^/]+)$/.exec(p);
  if (qm && method === 'GET') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 401, { ok: false, error: 'سجّل الدخول لعرض أسئلة الاختبار.' });
    const id = decodeURIComponent(qm[1]);
    const quiz = quizById.get(id);
    if (!quiz) return sendJSON(res, 404, { ok: false, error: 'الاختبار غير موجود.' });
    if (!canAccessQuiz(user, quiz)) return sendJSON(res, 403, { ok: false, error: 'هذا الاختبار غير متاح لحسابك.' });
    return sendJSON(res, 200, quiz);
  }

  if (p === '/api/contact' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'تعذّر قراءة البيانات المرسلة.' }); }
    const name = String(body.name || '').trim().slice(0, 120);
    const phone = normalizePhone(body.phone).slice(0, 20);
    const message = String(body.message || '').trim().slice(0, 4000);
    const fields = {};
    if (name.length < 2) fields.name = 'أدخل اسمك.';
    if (phone && !PHONE_RE.test(phone)) fields.phone = 'أدخل رقم موبايل مصريًا صحيحًا (11 رقمًا).';
    if (!phone) fields.phone = 'أدخل رقم هاتف للتواصل.';
    if (message.length < 5) fields.message = 'اكتب رسالتك (5 أحرف على الأقل).';
    if (Object.keys(fields).length) return sendJSON(res, 400, { ok: false, error: 'تحقّق من الحقول المظللة.', fields });
    state.messages.push({ id: 'MSG_' + Date.now(), name, phone, message, createdAt: nowISO() });
    persist();
    return sendJSON(res, 200, { ok: true, message: 'تم استلام رسالتك وحفظها لدى إدارة المنصة. سنتواصل معك على رقم هاتفك.' });
  }

  return sendJSON(res, 404, { ok: false, error: 'المسار غير موجود.' });
}

async function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch (e) { res.writeHead(400); return res.end('Bad Request'); }

  if (pathname === '/') pathname = '/index.html';
  let filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  let stat = null;
  try { stat = await fsp.stat(filePath); } catch (e) { stat = null; }

  if (!stat && !path.extname(filePath)) {
    const withHtml = filePath + '.html';
    try { const s = await fsp.stat(withHtml); if (s.isFile()) { filePath = withHtml; stat = s; } } catch (e) { }
  }

  if (!stat || !stat.isFile()) {
    // صفحة 404 متوافقة مع هوية الموقع.
    try {
      const notFound = await fsp.readFile(path.join(PUBLIC_DIR, '404.html'));
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(notFound);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — الصفحة غير موجودة');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (ext === '.html') headers['Cache-Control'] = 'no-cache';
  else headers['Cache-Control'] = 'public, max-age=3600';

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // على Vercel/Upstash تُقرأ الحالة مع كل طلب لأن العملية قد تكون جديدة.
  if (store.perRequest) {
    try { state = await store.read(); }
    catch (e) { console.error('[store] تعذّر قراءة الحالة:', e.message); }

    // لا نُرسل الرد قبل تثبيت الحالة، حتى يرى الطلب التالي التغيير فورًا.
    const originalEnd = res.end.bind(res);
    let persisted = false;
    res.end = function (chunk, encoding, callback) {
      if (persisted) return originalEnd(chunk, encoding, callback);
      persisted = true;
      if (!dirty) return originalEnd(chunk, encoding, callback);
      dirty = false;
      store.write(state)
        .catch(e => console.error('[state] تعذّر حفظ الحالة:', e.message))
        .finally(() => originalEnd(chunk, encoding, callback));
      return res;
    };
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Allow': 'GET,POST,OPTIONS' });
        return res.end();
      }
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET,HEAD' });
      return res.end('Method Not Allowed');
    }
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) sendJSON(res, 500, { ok: false, error: 'حدث خطأ غير متوقع في الخادم.' });
    else res.end();
  } finally {
    if (store.perRequest) {
      if (dirty) {
        dirty = false;
        try { await store.write(state); }
        catch (e) { console.error('[state] تعذّر حفظ الحالة:', e.message); }
      }
    } else {
      try { await store.flush(); }
      catch (e) { console.error('[state] تعذّر حفظ الحالة:', e.message); }
    }
  }
}

async function start() {
  state = await store.read();
  const server = http.createServer(handle);
  server.listen(PORT, HOST, () => {
    console.log(`منصة مستر أمين الغازي — http://${HOST}:${PORT}`);
    console.log(`التخزين: ${store.mode} · الكورسات: ${coursesData.items.length} · المحاضرات: ${lecturesData.lectures.length} · الاختبارات: ${quizIndex.items.length}`);
  });
  return server;
}

if (require.main === module) start();

module.exports = { handle, start, store };
