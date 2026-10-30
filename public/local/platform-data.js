/* ============================================================
   platform-data.js — طبقة البيانات المحلية لواجهة الطالب
   منصة مستر أمين الغازي — نسخة إعادة البناء المحلية

   تحاكي واجهة platform-data.js الأصلية (AlaminData) لكن مصدرها
   خادم Node المحلي (/api/*) بدل Firestore، مع نفس العقود:
     courses.subscribe/once/peek/refresh
     lectures.subscribe/once/peek/refresh
     quizzes.subscribe/once/map/metaOf/ensureMeta/getFull/complete
     attempts(sid).subscribe/once/peek/patch/refresh
     student(collection,id).subscribe/once/peek/refresh

   مزايا التشغيل المحلي:
   - عرض فوري من نسخة localStorage ثم تأكيد من الخادم.
   - إعادة محاولة تلقائية مع تراجع تدريجي عند تعذّر الاتصال.
   - تحديث دوري خفيف (polling) بدل مستمعات Firestore اللحظية.
   ============================================================ */
(function (w) {
  'use strict';
  if (w.AlaminData) return;

  var CFG = {
    FRESH_MAX_AGE: 7 * 864e5,
    RETRY: [1200, 3000, 8000, 20000, 45000],
    MAX_RETRIES: 6,
    SLOW_MS: 7000,
    POLL_MS: 25000,
    QUIZ_FRESH_MS: 5 * 60e3,
    META_TTL_MS: 6 * 3600e3
  };

  function now() { return Date.now(); }
  function lsGet(k) { try { var v = w.localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function lsSet(k, v) { try { w.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { w.localStorage.removeItem(k); } catch (e) { } }
  function isArr(a) { return Array.isArray(a); }
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (isArr(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function offline() { return typeof w.navigator !== 'undefined' && w.navigator.onLine === false; }

  function requestJSON(url, opts) {
    opts = opts || {};
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { try { ctl.abort(); } catch (e) { } }, opts.timeout || 12000) : null;
    return fetch(url, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: Object.assign({ 'Accept': 'application/json' }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, data: d };
      });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  var stats = { requests: 0, errors: 0, emits: 0 };

  /* ---------------- Store ---------------- */
  var ALL = [];

  function Store(def) {
    this.def = def;
    this.data = undefined;
    this.fallback = undefined;
    this.sig = null;
    this.version = 0;
    this.live = false;
    this.state = 'idle';
    this.err = null;
    this.slow = false;
    this.subs = [];
    this.inflight = null;
    this.attempt = 0;
    this.retryT = null;
    this.slowT = null;
    this.pollT = null;
    this.graceT = null;
    this.liveWaiters = [];
    this.started = false;
    ALL.push(this);
  }

  Store.prototype._cacheRead = function () {
    if (!this.def.cacheKey) return null;
    var d = lsGet(this.def.cacheKey);
    var m = this.def.cacheMetaKey ? lsGet(this.def.cacheMetaKey) : null;
    return d == null ? null : { data: d, ts: (m && m.ts) || 0 };
  };

  Store.prototype._cacheWrite = function (data, ts) {
    if (!this.def.cacheKey) return;
    if (data !== null && data !== undefined) {
      var value = this.def.cacheValue ? this.def.cacheValue(data) : data;
      lsSet(this.def.cacheKey, value);
    }
    if (this.def.cacheMetaKey) lsSet(this.def.cacheMetaKey, { ts: ts });
  };

  Store.prototype._prime = function () {
    if (this.started) return;
    this.started = true;
    var c = null;
    try { c = this._cacheRead(); } catch (e) { }
    if (!c || c.data === undefined) return;
    this.fallback = c.data;
    if (c.ts && now() - c.ts < CFG.FRESH_MAX_AGE) {
      this.data = c.data;
      this.sig = stable(c.data);
      this.version++;
      this.state = 'cached';
    }
  };

  Store.prototype._ok = function () { return this.live || (this.state !== 'error' && !this.slow && !offline()); };

  Store.prototype._payload = function () {
    return {
      data: this.data,
      hasData: this.data !== undefined,
      live: this.live,
      ok: this._ok(),
      state: this.state,
      error: this.err,
      version: this.version
    };
  };

  Store.prototype._emit = function () {
    var s = this.subs.slice(), i;
    for (i = 0; i < s.length; i++) {
      stats.emits++;
      try { s[i](this._payload()); }
      catch (e) { if (w.console) w.console.error('[AlaminData] subscriber failed', e); }
    }
  };

  Store.prototype.subscribe = function (cb) {
    var self = this;
    this._prime();
    this.subs.push(cb);
    if (this.graceT) { clearTimeout(this.graceT); this.graceT = null; }
    if (this.data !== undefined || this.state === 'error') {
      Promise.resolve().then(function () {
        if (self.subs.indexOf(cb) > -1) {
          try { cb(self._payload()); } catch (e) { }
        }
      });
    }
    this._ensureAttached();
    var gone = false;
    return function () {
      if (gone) return; gone = true;
      var i = self.subs.indexOf(cb);
      if (i > -1) self.subs.splice(i, 1);
      if (!self.subs.length && !self.graceT) {
        self.graceT = setTimeout(function () {
          self.graceT = null;
          if (!self.subs.length) self._detach();
        }, 3000);
      }
    };
  };

  Store.prototype._ensureAttached = function () {
    if (!this.subs.length || this.inflight) return;
    this._fetch();
  };

  Store.prototype._armSlow = function () {
    var self = this;
    clearTimeout(this.slowT);
    this.slowT = setTimeout(function () {
      if (self.live) return;
      self.slow = true;
      if (self.data === undefined && self.fallback !== undefined) {
        self.data = self.fallback;
        self.sig = stable(self.fallback);
        self.version++;
        self.state = 'cached';
      } else if (self.data === undefined) self.state = 'slow';
      self._emit();
    }, CFG.SLOW_MS);
  };

  Store.prototype._fetch = function (force) {
    var self = this;
    if (this.inflight) return this.inflight;
    if (!force && this.live && this.lastAt && now() - this.lastAt < 800) return Promise.resolve(this._payload());
    this._armSlow();
    if (this.data === undefined && this.state !== 'error') this.state = 'loading';
    stats.requests++;
    this.inflight = requestJSON(this.def.url).then(function (r) {
      self.inflight = null;
      if (!r.ok) {
        var err = new Error('http-' + r.status);
        err.status = r.status;
        err.body = r.data;
        throw err;
      }
      var data = self.def.map ? self.def.map(r.data || {}) : r.data;
      self._accept(data, true);
      self._schedulePoll();
      return self._payload();
    }).catch(function (err) {
      self.inflight = null;
      self._onError(err);
      return self._payload();
    });
    return this.inflight;
  };

  Store.prototype._accept = function (data, live) {
    var sig = stable(data), changed = sig !== this.sig;
    if (changed) {
      this.data = data;
      this.sig = sig;
      this.version++;
    }
    if (live) {
      this.live = true;
      this.slow = false;
      this.err = null;
      this.attempt = 0;
      this.state = 'live';
      this.lastAt = now();
      clearTimeout(this.slowT);
      try { this._cacheWrite(changed ? data : null, now()); } catch (e) { }
    } else {
      this.live = false;
      if (this.state !== 'error') this.state = this.data === undefined ? 'loading' : 'cached';
    }
    var wt = live ? this.liveWaiters.splice(0) : [], i;
    this._emit();
    for (i = 0; i < wt.length; i++) wt[i]();
  };

  Store.prototype._onError = function (err) {
    stats.errors++;
    this.err = err;
    this.live = false;
    this.state = 'error';
    clearTimeout(this.slowT);
    if (this.data === undefined && this.fallback !== undefined) {
      this.data = this.fallback;
      this.sig = stable(this.fallback);
      this.version++;
    }
    var self = this, wt = this.liveWaiters.splice(0), i;
    this._emit();
    for (i = 0; i < wt.length; i++) wt[i]();
    if (this.attempt < CFG.MAX_RETRIES && this.subs.length) {
      var d = CFG.RETRY[Math.min(this.attempt, CFG.RETRY.length - 1)];
      this.attempt++;
      clearTimeout(this.retryT);
      this.retryT = setTimeout(function () { self.retryT = null; self._fetch(true); }, d);
    } else {
      this._schedulePoll(CFG.POLL_MS * 2);
    }
  };

  Store.prototype._schedulePoll = function (ms) {
    var self = this;
    clearTimeout(this.pollT);
    if (!this.subs.length) return;
    this.pollT = setTimeout(function () {
      self.pollT = null;
      if (!self.subs.length) return;
      self._fetch(true);
    }, ms || CFG.POLL_MS);
  };

  Store.prototype._detach = function () {
    clearTimeout(this.slowT);
    clearTimeout(this.retryT);
    clearTimeout(this.pollT);
    this.retryT = this.pollT = null;
    if (this.inflight && this.inflight.abort) { try { this.inflight.abort(); } catch (e) { } }
  };

  Store.prototype.refresh = function () {
    this.attempt = 0;
    clearTimeout(this.retryT);
    clearTimeout(this.pollT);
    this.retryT = this.pollT = null;
    if (!this.subs.length) this._prime();
    this._fetch(true);
  };

  Store.prototype.once = function (opts) {
    var self = this;
    opts = opts || {};
    var timeout = opts.timeout != null ? opts.timeout : 9000;
    this._prime();
    return new Promise(function (resolve) {
      if (self.live) return resolve(self._payload());
      var done = false, t = null, un = null;
      function fin() {
        if (done) return; done = true;
        clearTimeout(t);
        var i = self.liveWaiters.indexOf(fin);
        if (i > -1) self.liveWaiters.splice(i, 1);
        if (un) un();
        resolve(self._payload());
      }
      t = setTimeout(fin, timeout);
      self.liveWaiters.push(fin);
      un = self.subscribe(function () { });
    });
  };

  Store.prototype.peek = function () {
    this._prime();
    return this._payload();
  };

  Store.prototype.api = function () {
    var s = this;
    return {
      subscribe: function (cb) { return s.subscribe(cb); },
      once: function (o) { return s.once(o); },
      peek: function () { return s.peek(); },
      refresh: function () { s.refresh(); }
    };
  };

  /* ---------------- 1) الكورسات ---------------- */
  var coursesStore = new Store({
    key: 'courses',
    url: '/api/data/courses',
    map: function (d) { return d && isArr(d.items) ? d.items : []; },
    cacheKey: 'alamin_courses',
    cacheMetaKey: 'alamin_pd_m_courses'
  });

  /* ---------------- 2) المحاضرات ---------------- */
  var lecturesStore = new Store({
    key: 'lectures',
    url: '/api/data/lectures',
    map: function (d) { return d && isArr(d.lectures) ? d.lectures : []; },
    cacheKey: 'alamin_lectures',
    cacheMetaKey: 'alamin_pd_m_lectures'
  });

  /* ---------------- 3) الاختبارات ---------------- */
  function metaFrom(id, q) {
    q = q || {};
    return {
      id: String(id),
      title: q.title || '',
      grade: q.grade == null ? '' : q.grade,
      subject: q.subject || '',
      time: q.time,
      questionsCount: q.questionsCount,
      qn: typeof q.qn === 'number' ? q.qn : (isArr(q.questionsList) ? q.questionsList.length : (parseInt(q.questionsCount, 10) || 0)),
      totalPoints: q.totalPoints,
      averageGrade: q.averageGrade,
      passingGrade: q.passingGrade,
      isPublished: q.isPublished === true,
      createdAt: q.createdAt || '',
      updatedAt: q.updatedAt || ''
    };
  }

  var QMEM = {};
  var EXTRA = {};
  var EXTRA_P = {};

  var quizzesStore = new Store({
    key: 'quizzes',
    url: '/api/data/quizzes',
    map: function (d) {
      var items = d && isArr(d.items) ? d.items : [];
      return { via: 'index', items: items.map(function (q) { return metaFrom(q && q.id, q); }) };
    },
    cacheKey: 'alamin_pd_quiz_index',
    cacheMetaKey: 'alamin_pd_m_quiz_index'
  });

  var mapMemo = { v: -1, m: {} };
  function indexMap() {
    var p = quizzesStore.peek();
    if (mapMemo.v === p.version) return mapMemo.m;
    var m = {}, d = p.data;
    if (d && isArr(d.items)) d.items.forEach(function (x) { if (x && x.id != null) m[String(x.id)] = x; });
    mapMemo = { v: p.version, m: m };
    return m;
  }

  function metaOf(id) {
    id = String(id);
    var m = indexMap()[id];
    if (m) return m;
    var e = EXTRA[id];
    if (e !== undefined) return e;
    var p = quizzesStore.peek();
    if (p.data && p.data.via === 'index' && p.live) return null;
    return undefined;
  }

  function ensureMeta(ids) {
    var list = (ids || []).map(String);
    if (!list.some(function (id) { return metaOf(id) === undefined; })) return Promise.resolve();
    return quizzesStore.once({ timeout: 7000 }).then(function () {
      var jobs = [];
      list.forEach(function (id) {
        if (metaOf(id) !== undefined) return;
        if (!EXTRA_P[id]) {
          stats.requests++;
          EXTRA_P[id] = requestJSON('/api/quizzes/' + encodeURIComponent(id)).then(function (r) {
            if (r.ok && r.data && r.data.id) {
              var meta = metaFrom(id, r.data);
              EXTRA[id] = meta;
              QMEM[id] = { data: r.data, updatedAt: r.data.updatedAt || '', ts: now() };
            } else if (r.status === 404) {
              EXTRA[id] = null;
            }
          }).catch(function () { }).then(function () { delete EXTRA_P[id]; });
        }
        jobs.push(EXTRA_P[id]);
      });
      return Promise.all(jobs);
    });
  }

  function getFull(id, opts) {
    id = String(id);
    opts = opts || {};
    var rec = QMEM[id], meta = metaOf(id);
    if (rec && rec.data && !opts.force) {
      var byIndex = !!(meta && meta.updatedAt && String(rec.updatedAt || '') === String(meta.updatedAt));
      var recent = !opts.fresh && (now() - (rec.ts || 0)) < CFG.QUIZ_FRESH_MS;
      if (byIndex || recent) return Promise.resolve(rec.data);
    }
    stats.requests++;
    return requestJSON('/api/quizzes/' + encodeURIComponent(id)).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        var e = new Error(r.data && r.data.error ? r.data.error : 'quiz-forbidden');
        e.code = 'forbidden'; throw e;
      }
      if (r.status === 404) {
        var nf = new Error('quiz-not-found'); nf.code = 'not-found'; throw nf;
      }
      if (!r.ok || !r.data || !r.data.id) throw new Error('quiz-load-failed');
      QMEM[id] = { data: r.data, updatedAt: r.data.updatedAt || '', ts: now() };
      return r.data;
    }).catch(function (err) {
      if (rec && rec.data && !(err && err.code === 'not-found')) return rec.data;
      throw err;
    });
  }

  var quizzesApi = quizzesStore.api();
  quizzesApi.map = indexMap;
  quizzesApi.metaOf = metaOf;
  quizzesApi.ensureMeta = ensureMeta;
  quizzesApi.getFull = getFull;
  quizzesApi.complete = function () {
    var p = quizzesStore.peek();
    return !!(p.data && p.data.via === 'index');
  };

  /* ---------------- 4) نتائج الطالب ---------------- */
  var ATT = {};
  function attemptsStore(sid) {
    sid = String(sid);
    if (!ATT[sid]) {
      ATT[sid] = new Store({
        key: 'attempts:' + sid,
        url: '/api/attempts',
        map: function (d) {
          var out = {};
          if (d && isArr(d.items)) {
            d.items.forEach(function (a) {
              if (a && a.quizId != null && (a.status === 'submitted' || a.status === 'absent')) out[String(a.quizId)] = a;
            });
          }
          return out;
        },
        cacheKey: 'alamin_exam_done_' + sid,
        cacheMetaKey: 'alamin_pd_m_att_' + sid
      });
    }
    return ATT[sid];
  }
  function attemptsApi(sid) {
    var s = attemptsStore(sid), a = s.api();
    a.patch = function (quizId, rec) {
      s._prime();
      var cur = s.data || {}, n = {};
      Object.keys(cur).forEach(function (k) { n[k] = cur[k]; });
      n[String(quizId)] = rec;
      s._accept(n, s.live);
    };
    return a;
  }

  /* ---------------- 5) مستند الطالب ---------------- */
  var STU = {};
  function studentApi(collection, id) {
    var key = collection + '/' + id;
    if (!STU[key]) {
      STU[key] = new Store({
        key: 'student:' + key,
        url: '/api/student',
        map: function (d) { return d && typeof d === 'object' ? d : {}; },
        cacheKey: 'alamin_pd_stu_' + key,
        cacheMetaKey: 'alamin_pd_m_stu_' + key,
        cacheValue: function (d) { return { enrolledCourses: isArr(d.enrolledCourses) ? d.enrolledCourses : [] }; }
      });
    }
    return STU[key].api();
  }

  /* ---------------- أحداث عامة ---------------- */
  function each(fn) { ALL.slice().forEach(fn); }
  try {
    w.addEventListener('online', function () {
      each(function (s) { if (s.subs.length && (!s.live || s.state === 'error')) s.refresh(); });
    });
    w.document.addEventListener('visibilitychange', function () {
      if (!w.document.hidden) {
        each(function (s) {
          if (!s.subs.length) return;
          if (s.state === 'error' || (s.lastAt && now() - s.lastAt > CFG.POLL_MS)) s.refresh();
        });
      }
    });
    w.addEventListener('pageshow', function (e) {
      if (e && e.persisted) each(function (s) { if (s.subs.length) s.refresh(); });
    });
    w.addEventListener('pagehide', function () { each(function (s) { s._detach(); }); });
  } catch (e) { }

  w.AlaminData = {
    courses: coursesStore.api(),
    lectures: lecturesStore.api(),
    quizzes: quizzesApi,
    attempts: attemptsApi,
    student: studentApi,
    ready: function () { return Promise.resolve(true); },
    stats: function () { return Object.assign({}, stats, { stores: ALL.length }); },
    config: CFG,
    _Store: Store
  };
})(window);
