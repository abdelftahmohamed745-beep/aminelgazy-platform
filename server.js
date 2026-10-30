'use strict';
/*
 * نقطة التشغيل المحلية. على Vercel يستخدم المشروع api/[...path].js.
 */
const { start } = require('./lib/app');

start().catch(err => {
  console.error('[start]', err);
  process.exit(1);
});
