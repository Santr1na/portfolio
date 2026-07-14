"use strict";

const path = require("path");

const DEFAULT_LOCALE = "ru";
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

/** Static assets (CSS, JS, images): never under locale prefixes. */
function assetUrl(appBase, pathname) {
  const pathPart = normalizePath(pathname);
  if (!appBase) return pathPart;
  if (pathPart === "/") return `${appBase}/`;
  return `${appBase}${pathPart}`;
}

/** Localized page URL: Russian (default) has no prefix; English uses /en. */
function pageUrl(appBase, locale, pathname) {
  const pathPart = normalizePath(pathname);
  const enPrefix = locale === "en" ? "/en" : "";
  if (pathPart === "/") {
    if (!appBase) return enPrefix ? `${enPrefix}/` : "/";
    return `${appBase}${enPrefix}/`;
  }
  if (!appBase) return `${enPrefix}${pathPart}`;
  return `${appBase}${enPrefix}${pathPart}`;
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
