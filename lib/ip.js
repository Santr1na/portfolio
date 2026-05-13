"use strict";

const crypto = require("crypto");

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

function hashIp(req) {
  const ip = clientIp(req);
  const salt = process.env.IP_HASH_SALT || "freelansee-ip-salt-change-me";
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 24);
}

module.exports = { clientIp, hashIp };
