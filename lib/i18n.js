"use strict";

const path = require("path");

const DEFAULT_LOCALE = "en";
const SUPPORTED = ["en", "ru"];

const bundles = {
  en: require(path.join(__dirname, "..", "locales", "en.json")),
  ru: require(path.join(__dirname, "..", "locales", "ru.json")),
};

function normalizePath(p) {
  if (p == null || p === "") return "/";
  let s = String(p).trim();
  if (!s.startsWith("/")) s = `/${s}`;
  return s;
}

function t(locale, key) {
  const lang = SUPPORTED.includes(locale) ? locale : DEFAULT_LOCALE;
  const table = bundles[lang] || bundles[DEFAULT_LOCALE];
  const v = table[key];
  if (v != null && v !== "") return v;
  const fb = bundles[DEFAULT_LOCALE][key];
  return fb != null ? fb : key;
}

/** Static assets (CSS, JS, images): never under /ru. */
function assetUrl(appBase, pathname) {
  const pathPart = normalizePath(pathname);
  if (!appBase) return pathPart;
  if (pathPart === "/") return `${appBase}/`;
  return `${appBase}${pathPart}`;
}

/** Localized page URL: English has no /ru prefix. */
function pageUrl(appBase, locale, pathname) {
  const pathPart = normalizePath(pathname);
  const ru = locale === "ru" ? "/ru" : "";
  if (pathPart === "/") {
    if (!appBase) return ru ? `${ru}/` : "/";
    return `${appBase}${ru}/`;
  }
  if (!appBase) return `${ru}${pathPart}`;
  return `${appBase}${ru}${pathPart}`;
}

function adminUrl(appBase, pathname) {
  return pageUrl(appBase, DEFAULT_LOCALE, pathname);
}

function dateLocaleTag(locale) {
  return locale === "ru" ? "ru-RU" : "en-GB";
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED,
  t,
  assetUrl,
  pageUrl,
  adminUrl,
  dateLocaleTag,
};
