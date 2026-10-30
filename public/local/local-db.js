/* ============================================================
   local-db.js — جسر توافق Firestore (الحد الأدنى) لصفحات الاختبارات
   المنصة المحلية تحفظ النتائج في /api/attempts وليس في السحابة.
   test.html يكتب ويقرأ:
     db.collection('quiz_attempts').doc('ATT_<sid>_<quizId>').get()/set()
   وهذا الملف يوفّر نفس الشكل فوق واجهات الخادم المحلي.
   ============================================================ */
(function (w) {
  'use strict';
  if (w.db) return;

  function jsonFetch(url, opts) {
    opts = opts || {};
    return fetch(url, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: Object.assign({ 'Accept': 'application/json' }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, data: d };
      });
    });
  }

  function snapshot(exists, data, id) {
    return {
      id: id || null,
      exists: !!exists,
      data: function () { return data; },
      get: function (field) { return data ? data[field] : undefined; }
    };
  }

  function attemptDoc(id) {
    return {
      id: id,
      get: function () {
        return jsonFetch('/api/attempts/doc?id=' + encodeURIComponent(id)).then(function (r) {
          if (!r.ok) return snapshot(false, undefined, id);
          return snapshot(!!r.data.exists, r.data.exists ? r.data.data : undefined, id);
        });
      },
      set: function (rec) {
        return jsonFetch('/api/attempts', { method: 'POST', body: { rec: rec } }).then(function (r) {
          if (r.status === 409) {
            var e = new Error('duplicate');
            e.dup = (r.data && r.data.attempt) || null;
            throw e;
          }
          if (!r.ok) {
            var err = new Error((r.data && r.data.error) || 'attempt-save-failed');
            err.status = r.status;
            throw err;
          }
          return true;
        });
      },
      update: function (patch) {
        var base = patch || {};
        return jsonFetch('/api/attempts', { method: 'POST', body: { rec: base } });
      }
    };
  }

  function subcollection(name, parentId) {
    return {
      doc: function (id) {
        var full = parentId + '/' + name + '/' + id;
        return {
          get: function () { return Promise.resolve(snapshot(false, undefined, full)); },
          set: function () { return Promise.resolve(true); },
          update: function () { return Promise.resolve(true); }
        };
      }
    };
  }

  function collection(name) {
    return {
      doc: function (id) {
        var ref = attemptDoc(String(id));
        ref.collection = function (sub) { return subcollection(sub, String(id)); };
        return ref;
      },
      where: function () {
        var q = {
          limit: function () { return q; },
          get: function () { return Promise.resolve({ docs: [], size: 0, empty: true, forEach: function () { } }); }
        };
        return q;
      },
      get: function () { return Promise.resolve({ docs: [], size: 0, empty: true, forEach: function () { } }); }
    };
  }

  w.db = {
    __localBridge: true,
    collection: collection,
    enablePersistence: function () { return Promise.resolve(); }
  };
})(window);
