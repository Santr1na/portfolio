"use strict";

const crypto = require("crypto");

const pwd = process.argv[2];
if (!pwd || pwd.length < 8) {
  console.error("Usage: node scripts/hash-admin-password.js 'your-long-password'");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pwd, salt, 64);
console.log("ADMIN_PASSWORD_SCRYPT=" + salt.toString("hex") + ":" + hash.toString("hex"));
