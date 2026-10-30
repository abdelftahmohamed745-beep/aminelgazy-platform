'use strict';
/*
 * طبقة تخزين قابلة للتبديل:
 *   - kv     : Upstash Redis / Vercel KV عبر REST
 *   - blob   : Vercel Blob (التخزين الافتراضي على Vercel بعد ربط المتجر)
 *   - memory : احتياطي داخل العملية عند غياب أي تخزين دائم
 *   - file   : ملف data/state.json (التشغيل المحلي)
 *
 * الواجهة: read() / write(state) / scheduleWrite(getState) / flush() / describe()
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = process.env.STATE_FILE || path.join(DATA_DIR, 'state.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');
const KV_KEY = process.env.STATE_KEY || 'aminelgazy:platform:state:v1';
const BLOB_PATH = process.env.BLOB_STATE_PATH || 'platform/state.json';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';

const EMPTY = () => ({ users: [], sessions: {}, attempts: [], messages: [], nextUserId: 1 });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJSONSync(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function seedState() {
  const seed = readJSONSync(SEED_FILE);
  const base = seed && typeof seed === 'object' ? clone(seed) : EMPTY();
  base.users ||= [];
  base.sessions ||= {};
  base.attempts ||= [];
  base.messages ||= [];
  base.nextUserId ||= 1;
  // لا ننشر جلسات محفوظة مسبقًا من نسخة محلية.
  base.sessions = {};
  return base;
}

function normalizeState(value) {
  const state = value && typeof value === 'object' ? value : EMPTY();
  state.users ||= [];
  state.sessions ||= {};
  state.attempts ||= [];
  state.messages ||= [];
  state.nextUserId ||= 1;
  return state;
}

function createKvStore() {
  async function command(args) {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    });
    if (!res.ok) throw new Error(`kv ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  return {
    mode: 'kv',
    perRequest: true,
    async read() {
      const { result } = await command(['GET', KV_KEY]);
      if (!result) {
        const seeded = seedState();
        await this.write(seeded);
        return seeded;
      }
      try { return normalizeState(JSON.parse(result)); }
      catch (e) { return seedState(); }
    },
    async write(state) {
      await command(['SET', KV_KEY, JSON.stringify(state)]);
    },
    scheduleWrite() {},
    async flush() {},
    describe() { return { mode: 'kv', persistent: true }; }
  };
}

function createBlobStore() {
  const { get, put } = require('@vercel/blob');
  const options = { token: BLOB_TOKEN };

  return {
    mode: 'blob',
    perRequest: true,
    async read() {
      const result = await get(BLOB_PATH, { ...options, access: 'private', useCache: false });
      if (!result) {
        const seeded = seedState();
        await this.write(seeded);
        return seeded;
      }
      const text = await new Response(result.stream).text();
      return normalizeState(JSON.parse(text));
    },
    async write(state) {
      await put(BLOB_PATH, JSON.stringify(state), {
        ...options,
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 0
      });
    },
    scheduleWrite() {},
    async flush() {},
    describe() { return { mode: 'blob', persistent: true, path: BLOB_PATH }; }
  };
}

function createMemoryStore() {
  let cache = null;
  return {
    mode: 'memory',
    perRequest: true,
    async read() {
      if (!cache) cache = seedState();
      return cache;
    },
    async write(state) { cache = state; },
    scheduleWrite() {},
    async flush() {},
    describe() { return { mode: 'memory', persistent: false }; }
  };
}

function createFileStore() {
  let timer = null;
  let pending = null;

  async function writeNow(state) {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 1));
    await fsp.rename(tmp, STATE_FILE);
  }

  return {
    mode: 'file',
    perRequest: false,
    async read() {
      const state = readJSONSync(STATE_FILE);
      return state ? normalizeState(state) : seedState();
    },
    async write(state) { await writeNow(state); },
    scheduleWrite(getState) {
      pending = getState;
      if (timer) return;
      timer = setTimeout(async () => {
        timer = null;
        const state = pending ? pending() : null;
        pending = null;
        if (!state) return;
        try { await writeNow(state); }
        catch (e) { console.error('[state] فشل حفظ الحالة:', e.message); }
      }, 120);
    },
    async flush() {
      if (!timer || !pending) return;
      clearTimeout(timer);
      timer = null;
      const state = pending();
      pending = null;
      await writeNow(state);
    },
    describe() { return { mode: 'file', persistent: true, file: 'data/state.json' }; }
  };
}

function createStore() {
  if (KV_URL && KV_TOKEN) return createKvStore();
  if (BLOB_TOKEN) return createBlobStore();
  if (process.env.VERCEL) return createMemoryStore();
  return createFileStore();
}

module.exports = { createStore, EMPTY, SEED_FILE, STATE_FILE };
