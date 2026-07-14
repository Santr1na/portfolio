"use strict";

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieSession = require("cookie-session");
const expressLayouts = require("express-ejs-layouts");
const { nanoid } = require("nanoid");

const i18n = require("./lib/i18n");

const {
  createQuestion,
  listQuestionsForAdmin,
  getQuestionById,
  getPublishedBySlug,
  setAnswer,
  publishQuestion,
  slugExists,
  addArticleFeedback,
  getFeedbackStatsForSlug,
  listArticleFeedbackDesc,
} = require("./lib/store");
const { hashIp } = require("./lib/ip");

function verifyAdminPassword(password) {
  const stored = process.env.ADMIN_PASSWORD_SCRYPT;
  if (!stored || typeof password !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[0], "hex");
    expected = Buffer.from(parts[1], "hex");
  } catch {
    return false;
  }
  let actual;
  try {
    actual = crypto.scryptSync(password, salt, 64);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

const PLAY_URL =
  process.env.PLAY_STORE_URL ||
  "https://play.google.com/store/apps/details?id=g324.klokov.tpv_app";

const PORT = Number(process.env.PORT) || 3017;
const HOST = process.env.HOST || "127.0.0.1";

function normalizeAppBase(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return "/" + s.replace(/^\/+|\/+$/g, "");
}

const APP_BASE = normalizeAppBase(process.env.APP_BASE_PATH || "");

/** Reserved slug for site-wide app rating/feedback (not a published Q&A slug). */
const SITE_APP_REVIEW_SLUG = "__gs_site_review__";

const imagesDir = path.join(__dirname, "images");

function forwardedAssetBase(req) {
  if (APP_BASE) return APP_BASE;
  const raw = String(req.get("x-forwarded-prefix") || "").trim();
  if (!raw || raw === "/") return "";
  const n = normalizeAppBase(raw);
  if (!/^\/[A-Za-z0-9/_-]{1,80}$/.test(n)) return "";
  return n;
}

function collectImageRouteBases() {
  const bases = new Set();
  bases.add("");
  if (APP_BASE) bases.add(APP_BASE);
  String(process.env.IMAGE_ASSET_BASES || "")
    .split(/[,\s]+/)
    .map((s) => normalizeAppBase(s))
    .filter(Boolean)
    .forEach((b) => bases.add(b));
  return bases;
}

function registerImageAndFaviconRoutes(appInstance) {
  const bases = collectImageRouteBases();
  const iconFile = path.join(imagesDir, "ic_launcher_background.png");

  function sendImage(req, res, next) {
    const file = req.params.file;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file)) return next();
    const fp = path.join(imagesDir, file);
    fs.stat(fp, (err, st) => {
      if (err || !st.isFile()) return next();
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(fp, (e2) => (e2 ? next(e2) : undefined));
    });
  }

  bases.forEach((base) => {
    const prefix = base ? `${base}/images` : "/images";
    appInstance.get(`${prefix}/:file`, sendImage);
    const favPath = base ? `${base}/favicon.ico` : "/favicon.ico";
    appInstance.get(favPath, (req, res, next) => {
      fs.stat(iconFile, (err, st) => {
        if (err || !st.isFile()) return next();
        res.type("png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.sendFile(iconFile, (e2) => (e2 ? next(e2) : undefined));
      });
    });
  });
}

const app = express();
app.locals.appBase = APP_BASE;
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

const sessionKeys = (process.env.SESSION_SECRET || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (sessionKeys.length === 0) {
  sessionKeys.push("dev-only-CHANGE-SESSION_SECRET-in-production-min-32-chars");
}

app.use(
  cookieSession({
    name: "gs_session",
    keys: sessionKeys,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: APP_BASE || "/",
  })
);

app.use((req, res, next) => {
  if (!req.session._csrf) {
    req.session._csrf = crypto.randomBytes(24).toString("hex");
  }
  res.locals.csrfToken = req.session._csrf;
  res.locals.playUrl = PLAY_URL;
  const assetBase = APP_BASE || forwardedAssetBase(req);
  res.locals.assetUrl = (p) => i18n.assetUrl(assetBase, p);
  next();
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 400,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const askPostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ASK_MAX) || 8,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const feedbackLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_FEEDBACK_MAX) || 15,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.urlencoded({ extended: true, limit: "48kb" }));

registerImageAndFaviconRoutes(app);

function verifyCsrf(req, res, next) {
  const tfn = res.locals.t || ((k) => i18n.t(i18n.DEFAULT_LOCALE, k));
  const t = req.body && req.body._csrf;
  if (!t || t !== req.session._csrf) {
    return res.status(403).render("error", {
      title: tfn("err_title"),
      message: tfn("err_csrf"),
      layout: "layout",
    });
  }
  req.session._csrf = crypto.randomBytes(24).toString("hex");
  res.locals.csrfToken = req.session._csrf;
  next();
}

function attachPublicLocales(lang) {
  return (req, res, next) => {
    res.locals.lang = lang;
    res.locals.htmlLang = lang === "ru" ? "ru" : "en";
    res.locals.t = (k) => i18n.t(lang, k);
    res.locals.path = req.path;
    res.locals.langSwitcherPath = req.path === "" ? "/" : req.path;
    res.locals.appUrl = (p) => i18n.pageUrl(APP_BASE, lang, p);
    res.locals.pageUrl = (loc, p) => i18n.pageUrl(APP_BASE, loc, p);
    res.locals.dateLocale = i18n.dateLocaleTag(lang);
    next();
  };
}

function attachAdminLocales(req, res, next) {
  res.locals.lang = i18n.DEFAULT_LOCALE;
  res.locals.htmlLang = "en";
  res.locals.t = (k) => i18n.t(i18n.DEFAULT_LOCALE, k);
  res.locals.path = req.path;
  res.locals.langSwitcherPath = "/";
  res.locals.appUrl = (p) => i18n.adminUrl(APP_BASE, p);
  res.locals.pageUrl = (loc, p) => i18n.pageUrl(APP_BASE, loc, p);
  res.locals.dateLocale = i18n.dateLocaleTag(i18n.DEFAULT_LOCALE);
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect(i18n.adminUrl(APP_BASE, "/admin/login"));
}

function createPublicRouter(lang) {
  const r = express.Router();
  r.use(attachPublicLocales(lang));

  r.get("/", (req, res) => {
    const base = APP_BASE || forwardedAssetBase(req);
    const canonicalPath = i18n.pageUrl(APP_BASE, lang, "/");
    const host = req.get("host") || "localhost";
    res.render("home", {
      title: res.locals.t("home_title"),
      layout: "layout",
      isHome: true,
      metaDescription: res.locals.t("home_meta_description"),
      ogTitle: res.locals.t("home_og_title"),
      canonicalUrl: `${req.protocol}://${host}${canonicalPath}`,
      pageStyles: [res.locals.assetUrl("/landing.css")],
      pageScripts: [
        res.locals.assetUrl("/landing.js"),
        res.locals.assetUrl("/carousel.js"),
      ],
    });
  });

  r.get("/ask", (req, res) => {
    res.render("ask", {
      title: res.locals.t("ask_title"),
      sent: false,
      error: null,
      layout: "layout",
    });
  });

  r.post("/ask", askPostLimiter, verifyCsrf, (req, res) => {
    const { t } = res.locals;
    if (req.body.website && String(req.body.website).trim() !== "") {
      return res.render("ask", {
        title: t("ask_title"),
        sent: true,
        error: null,
        layout: "layout",
      });
    }

    const body = String(req.body.body || "").trim();
    const email = String(req.body.contact_email || "").trim().slice(0, 320);

    if (body.length < 12) {
      return res.render("ask", {
        title: t("ask_title"),
        sent: false,
        error: t("ask_err_short"),
        layout: "layout",
      });
    }
    if (body.length > 8000) {
      return res.render("ask", {
        title: t("ask_title"),
        sent: false,
        error: t("ask_err_long"),
        layout: "layout",
      });
    }

    if (email) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!ok) {
        return res.render("ask", {
          title: t("ask_title"),
          sent: false,
          error: t("ask_err_email"),
          layout: "layout",
        });
      }
    }

    const id = nanoid();
    createQuestion({
      id,
      body,
      contactEmail: email || null,
      createdAt: Date.now(),
      ipHash: hashIp(req),
    });

    res.render("ask", { title: t("ask_title"), sent: true, error: null, layout: "layout" });
  });

  r.get("/delete-account", (req, res) => {
    res.render("delete-account", {
      title: res.locals.t("delete_title"),
      layout: "layout",
    });
  });

  r.get("/review", (req, res) => {
    res.render("review", {
      title: res.locals.t("review_title"),
      thanks: req.query.thanks === "1",
      errEmpty: req.query.err === "empty",
      feedbackStats: getFeedbackStatsForSlug(SITE_APP_REVIEW_SLUG),
      layout: "layout",
    });
  });

  r.post("/review", feedbackLimiter, verifyCsrf, (req, res) => {
    if (req.body.company && String(req.body.company).trim() !== "") {
      return res.redirect(res.locals.appUrl("/review") + "?thanks=1");
    }
    let rating = req.body.rating != null && req.body.rating !== "" ? Number(req.body.rating) : null;
    if (rating != null && (Number.isNaN(rating) || rating < 1 || rating > 5)) {
      rating = null;
    }
    const comment = String(req.body.comment || "").trim().slice(0, 1500);
    if (!rating && !comment) {
      return res.redirect(res.locals.appUrl("/review") + "?err=empty");
    }
    addArticleFeedback({
      id: nanoid(),
      slug: SITE_APP_REVIEW_SLUG,
      rating,
      comment: comment || null,
      createdAt: Date.now(),
      ipHash: hashIp(req),
    });
    res.redirect(res.locals.appUrl("/review") + "?thanks=1");
  });

  r.get("/q/:slug", (req, res) => {
    const row = getPublishedBySlug(req.params.slug);
    if (!row) {
      return res.status(404).render("error", {
        title: res.locals.t("err_article_title"),
        message: res.locals.t("err_article_msg"),
        layout: "layout",
      });
    }
    res.render("article", {
      title: res.locals.t("article_title"),
      article: row,
      thanks: req.query.thanks === "1",
      errEmpty: req.query.err === "empty",
      feedbackStats: getFeedbackStatsForSlug(row.slug),
      layout: "layout",
    });
  });

  r.post("/q/:slug/feedback", feedbackLimiter, verifyCsrf, (req, res) => {
    const slug = req.params.slug;
    const row = getPublishedBySlug(slug);
    if (!row) {
      return res.status(404).render("error", {
        title: res.locals.t("err404_title"),
        message: res.locals.t("err404_msg"),
        layout: "layout",
      });
    }

    if (req.body.company && String(req.body.company).trim() !== "") {
      return res.redirect(res.locals.appUrl("/q/" + encodeURIComponent(slug)) + "?thanks=1");
    }

    let rating = req.body.rating != null && req.body.rating !== "" ? Number(req.body.rating) : null;
    if (rating != null && (Number.isNaN(rating) || rating < 1 || rating > 5)) {
      rating = null;
    }
    const comment = String(req.body.comment || "").trim().slice(0, 1500);
    if (!rating && !comment) {
      return res.redirect(res.locals.appUrl("/q/" + encodeURIComponent(slug)) + "?err=empty");
    }

    addArticleFeedback({
      id: nanoid(),
      slug,
      rating,
      comment: comment || null,
      createdAt: Date.now(),
      ipHash: hashIp(req),
    });

    res.redirect(res.locals.appUrl("/q/" + encodeURIComponent(slug)) + "?thanks=1");
  });

  return r;
}

app.get("/health", (req, res) => {
  res.type("text").send("ok");
});

app.use(createPublicRouter("en"));
app.use("/ru", createPublicRouter("ru"));

const adminRouter = express.Router();
adminRouter.use(attachAdminLocales);

adminRouter.get("/", (req, res) => {
  if (req.session.admin) return res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions"));
  res.redirect(i18n.adminUrl(APP_BASE, "/admin/login"));
});

adminRouter.get("/login", (req, res) => {
  if (req.session.admin) return res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions"));
  res.render("admin-login", { title: res.locals.t("admin_login_title"), error: null, layout: "layout" });
});

adminRouter.post("/login", loginLimiter, verifyCsrf, (req, res) => {
  const password = String(req.body.password || "");
  const stored = process.env.ADMIN_PASSWORD_SCRYPT;
  const { t } = res.locals;

  if (!stored) {
    return res.status(503).render("admin-login", {
      title: t("admin_login_title"),
      error: t("admin_err_no_hash"),
      layout: "layout",
    });
  }

  if (!verifyAdminPassword(password)) {
    return res.render("admin-login", {
      title: t("admin_login_title"),
      error: t("admin_err_bad_password"),
      layout: "layout",
    });
  }

  req.session.admin = true;
  res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions"));
});

adminRouter.post("/logout", verifyCsrf, (req, res) => {
  req.session = null;
  res.redirect(i18n.adminUrl(APP_BASE, "/admin/login"));
});

adminRouter.get("/questions", requireAdmin, (req, res) => {
  const questions = listQuestionsForAdmin();
  const articleFeedback = listArticleFeedbackDesc(150);
  res.render("admin-questions", {
    title: res.locals.t("admin_panel_title"),
    questions,
    articleFeedback,
    siteReviewSlug: SITE_APP_REVIEW_SLUG,
    query: req.query,
    layout: "layout",
  });
});

adminRouter.post("/questions/:id/answer", requireAdmin, verifyCsrf, (req, res) => {
  const id = req.params.id;
  const answer = String(req.body.answer || "").trim();
  if (!getQuestionById(id)) {
    return res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions"));
  }
  if (answer.length > 20000) {
    return res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions") + "?err=long#q-" + encodeURIComponent(id));
  }
  setAnswer(id, answer || null);
  res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions") + "#q-" + encodeURIComponent(id));
});

adminRouter.post("/questions/:id/publish", requireAdmin, verifyCsrf, (req, res) => {
  const id = req.params.id;
  const q = getQuestionById(id);
  if (!q || !String(q.answer || "").trim()) {
    return res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions") + "?err=noanswer");
  }
  if (q.status === "published" && q.slug) {
    return res.redirect(i18n.pageUrl(APP_BASE, i18n.DEFAULT_LOCALE, "/q/" + encodeURIComponent(q.slug)));
  }

  let slug;
  for (let i = 0; i < 8; i++) {
    const candidate = nanoid(12);
    if (!slugExists(candidate)) {
      slug = candidate;
      break;
    }
  }
  if (!slug) {
    return res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions") + "?err=slug");
  }

  if (!publishQuestion(id, slug, Date.now())) {
    return res.redirect(i18n.adminUrl(APP_BASE, "/admin/questions") + "?err=publish");
  }
  res.redirect(i18n.pageUrl(APP_BASE, i18n.DEFAULT_LOCALE, "/q/" + slug));
});

app.use("/admin", adminRouter);

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.use("/images", express.static(imagesDir));
if (APP_BASE) {
  app.use(APP_BASE, express.static(publicDir));
  app.use(`${APP_BASE}/images`, express.static(imagesDir));
}

function attachErrorLocals(req, res, next) {
  if (!res.locals.t) {
    res.locals.lang = i18n.DEFAULT_LOCALE;
    res.locals.htmlLang = "en";
    res.locals.t = (k) => i18n.t(i18n.DEFAULT_LOCALE, k);
    res.locals.path = req.path;
    res.locals.langSwitcherPath = "/";
    res.locals.appUrl = (p) => i18n.pageUrl(APP_BASE, i18n.DEFAULT_LOCALE, p);
    res.locals.pageUrl = (loc, p) => i18n.pageUrl(APP_BASE, loc, p);
    res.locals.dateLocale = i18n.dateLocaleTag(i18n.DEFAULT_LOCALE);
  }
  next();
}

app.use(attachErrorLocals);
app.use((req, res) => {
  res.status(404).render("error", {
    title: res.locals.t("err404_title"),
    message: res.locals.t("err404_msg"),
    layout: "layout",
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (!res.locals.t) {
    res.locals.lang = i18n.DEFAULT_LOCALE;
    res.locals.htmlLang = "en";
    res.locals.t = (k) => i18n.t(i18n.DEFAULT_LOCALE, k);
    res.locals.path = req.path;
    res.locals.langSwitcherPath = "/";
    res.locals.appUrl = (p) => i18n.pageUrl(APP_BASE, i18n.DEFAULT_LOCALE, p);
    res.locals.pageUrl = (loc, p) => i18n.pageUrl(APP_BASE, loc, p);
    res.locals.dateLocale = i18n.dateLocaleTag(i18n.DEFAULT_LOCALE);
  }
  res.status(500).render("error", {
    title: res.locals.t("err500_title"),
    message: res.locals.t("err500_msg"),
    layout: "layout",
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log("GameSearch site http://%s:%s/", HOST, PORT);
});
server.on("error", (err) => {
  console.error("GameSearch listen error:", err && err.message ? err.message : err);
  process.exit(1);
});
