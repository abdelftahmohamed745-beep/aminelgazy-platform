'use strict';
/*
 * دالة Vercel Serverless لكل مسارات /api/*.
 * الصفحات والأصول تُقدَّم من مجلد public عبر شبكة Vercel الثابتة.
 */
const { handle } = require('../lib/app');

module.exports = handle;
