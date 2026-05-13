"use strict";

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieSession = require("cookie-session");
const expressLayouts = require("express-ejs-layouts");
const { nanoid } = require("nanoid");

const {
  createQuestion,
  listQuestionsForAdmin,
  getQuestionById,
  getPublishedBySlug,
  setAnswer,
  publishQuestion,
  slugExists,
  addArticleFeedback,
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

const app = express();
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
  })
);

app.use((req, res, next) => {
  if (!req.session._csrf) {
    req.session._csrf = crypto.randomBytes(24).toString("hex");
  }
  res.locals.csrfToken = req.session._csrf;
  res.locals.playUrl = PLAY_URL;
  res.locals.path = req.path;
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

function verifyCsrf(req, res, next) {
  const t = req.body && req.body._csrf;
  if (!t || t !== req.session._csrf) {
    return res.status(403).render("error", {
      title: "Ошибка",
      message: "Сессия устарела или подпись формы недействительна. Обновите страницу.",
      layout: "layout",
    });
  }
  req.session._csrf = crypto.randomBytes(24).toString("hex");
  res.locals.csrfToken = req.session._csrf;
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect("/admin/login");
}

app.get("/admin", (req, res) => {
  if (req.session.admin) return res.redirect("/admin/questions");
  res.redirect("/admin/login");
});

app.get("/", (req, res) => {
  res.render("home", { title: "GameSearch", layout: "layout", pageScripts: ["/carousel.js"] });
});

app.get("/ask", (req, res) => {
  res.render("ask", {
    title: "Задать вопрос",
    sent: false,
    error: null,
    layout: "layout",
  });
});

app.post("/ask", askPostLimiter, verifyCsrf, (req, res) => {
  if (req.body.website && String(req.body.website).trim() !== "") {
    return res.render("ask", {
      title: "Задать вопрос",
      sent: true,
      error: null,
      layout: "layout",
    });
  }

  const body = String(req.body.body || "").trim();
  const email = String(req.body.contact_email || "").trim().slice(0, 320);

  if (body.length < 12) {
    return res.render("ask", {
      title: "Задать вопрос",
      sent: false,
      error: "Вопрос слишком короткий (минимум 12 символов).",
      layout: "layout",
    });
  }
  if (body.length > 8000) {
    return res.render("ask", {
      title: "Задать вопрос",
      sent: false,
      error: "Текст слишком длинный.",
      layout: "layout",
    });
  }

  if (email) {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) {
      return res.render("ask", {
        title: "Задать вопрос",
        sent: false,
        error: "Некорректный email.",
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

  res.render("ask", { title: "Задать вопрос", sent: true, error: null, layout: "layout" });
});

app.get("/delete-account", (req, res) => {
  res.render("delete-account", { title: "Delete account", layout: "layout", htmlLang: "en" });
});

app.get("/q/:slug", (req, res) => {
  const row = getPublishedBySlug(req.params.slug);
  if (!row) {
    return res.status(404).render("error", {
      title: "Не найдено",
      message: "Такой публикации нет.",
      layout: "layout",
    });
  }
  res.render("article", {
    title: "Вопрос и ответ",
    article: row,
    thanks: req.query.thanks === "1",
    errEmpty: req.query.err === "empty",
    layout: "layout",
  });
});

app.post("/q/:slug/feedback", feedbackLimiter, verifyCsrf, (req, res) => {
  const slug = req.params.slug;
  const row = getPublishedBySlug(slug);
  if (!row) {
    return res.status(404).render("error", { title: "Не найдено", message: "Страница не найдена.", layout: "layout" });
  }

  if (req.body.company && String(req.body.company).trim() !== "") {
    return res.redirect(`/q/${encodeURIComponent(slug)}?thanks=1`);
  }

  let rating = req.body.rating != null && req.body.rating !== "" ? Number(req.body.rating) : null;
  if (rating != null && (Number.isNaN(rating) || rating < 1 || rating > 5)) {
    rating = null;
  }
  const comment = String(req.body.comment || "").trim().slice(0, 1500);
  if (!rating && !comment) {
    return res.redirect(`/q/${encodeURIComponent(slug)}?err=empty`);
  }

  addArticleFeedback({
    id: nanoid(),
    slug,
    rating,
    comment: comment || null,
    createdAt: Date.now(),
    ipHash: hashIp(req),
  });

  res.redirect(`/q/${encodeURIComponent(slug)}?thanks=1`);
});

app.get("/admin/login", (req, res) => {
  if (req.session.admin) return res.redirect("/admin/questions");
  res.render("admin-login", { title: "Вход", error: null, layout: "layout" });
});

app.post("/admin/login", loginLimiter, verifyCsrf, (req, res) => {
  const password = String(req.body.password || "");
  const stored = process.env.ADMIN_PASSWORD_SCRYPT;

  if (!stored) {
    return res.status(503).render("admin-login", {
      title: "Вход",
      error: "Сервер не настроен: задайте ADMIN_PASSWORD_SCRYPT в окружении.",
      layout: "layout",
    });
  }

  if (!verifyAdminPassword(password)) {
    return res.render("admin-login", {
      title: "Вход",
      error: "Неверный пароль.",
      layout: "layout",
    });
  }

  req.session.admin = true;
  res.redirect("/admin/questions");
});

app.post("/admin/logout", verifyCsrf, (req, res) => {
  req.session = null;
  res.redirect("/admin/login");
});

app.get("/admin/questions", requireAdmin, (req, res) => {
  const questions = listQuestionsForAdmin();
  res.render("admin-questions", {
    title: "Вопросы",
    questions,
    query: req.query,
    layout: "layout",
  });
});

app.post("/admin/questions/:id/answer", requireAdmin, verifyCsrf, (req, res) => {
  const id = req.params.id;
  const answer = String(req.body.answer || "").trim();
  if (!getQuestionById(id)) {
    return res.redirect("/admin/questions");
  }
  if (answer.length > 20000) {
    return res.redirect(`/admin/questions?err=long#q-${encodeURIComponent(id)}`);
  }
  setAnswer(id, answer || null);
  res.redirect("/admin/questions#q-" + encodeURIComponent(id));
});

app.post("/admin/questions/:id/publish", requireAdmin, verifyCsrf, (req, res) => {
  const id = req.params.id;
  const q = getQuestionById(id);
  if (!q || !String(q.answer || "").trim()) {
    return res.redirect("/admin/questions?err=noanswer");
  }
  if (q.status === "published" && q.slug) {
    return res.redirect(`/q/${encodeURIComponent(q.slug)}`);
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
    return res.redirect("/admin/questions?err=slug");
  }

  if (!publishQuestion(id, slug, Date.now())) {
    return res.redirect("/admin/questions?err=publish");
  }
  res.redirect(`/q/${slug}`);
});

app.get("/health", (req, res) => {
  res.type("text").send("ok");
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(path.join(__dirname, "images")));

app.use((req, res) => {
  res.status(404).render("error", { title: "404", message: "Страница не найдена.", layout: "layout" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("error", {
    title: "Ошибка",
    message: "Внутренняя ошибка сервера.",
    layout: "layout",
  });
});

app.listen(PORT, HOST, () => {
  console.log("GameSearch site http://%s:%s/", HOST, PORT);
});
