"use strict";

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "store.json");

function ensureFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(
      dataFile,
      JSON.stringify({ questions: [], article_feedback: [] }, null, 2),
      "utf8"
    );
  }
}

function load() {
  ensureFile();
  const raw = fs.readFileSync(dataFile, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.questions)) data.questions = [];
  if (!Array.isArray(data.article_feedback)) data.article_feedback = [];
  return data;
}

function save(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
}

function mutate(fn) {
  const data = load();
  fn(data);
  save(data);
}

function createQuestion({ id, body, contactEmail, createdAt, ipHash }) {
  mutate((data) => {
    data.questions.push({
      id,
      body,
      contact_email: contactEmail || null,
      created_at: createdAt,
      ip_hash: ipHash || null,
      answer: null,
      status: "open",
      slug: null,
      published_at: null,
    });
  });
}

function listQuestionsForAdmin() {
  return load()
    .questions.slice()
    .sort((a, b) => b.created_at - a.created_at);
}

function getQuestionById(id) {
  return load().questions.find((q) => q.id === id) || null;
}

function getPublishedBySlug(slug) {
  return (
    load().questions.find((q) => q.slug === slug && q.status === "published") ||
    null
  );
}

function setAnswer(id, answer) {
  let ok = false;
  mutate((data) => {
    const q = data.questions.find((x) => x.id === id);
    if (!q) return;
    q.answer = answer;
    q.status = q.status === "published" ? "published" : "answered";
    ok = true;
  });
  return ok;
}

function publishQuestion(id, slug, publishedAt) {
  let ok = false;
  mutate((data) => {
    const q = data.questions.find((x) => x.id === id);
    if (!q || !String(q.answer || "").trim()) return;
    q.status = "published";
    q.slug = slug;
    q.published_at = publishedAt;
    ok = true;
  });
  return ok;
}

function slugExists(slug) {
  return load().questions.some((q) => q.slug === slug);
}

function addArticleFeedback({ id, slug, rating, comment, createdAt, ipHash }) {
  mutate((data) => {
    data.article_feedback.push({
      id,
      slug,
      rating: rating == null ? null : rating,
      comment: comment || null,
      created_at: createdAt,
      ip_hash: ipHash || null,
    });
  });
}

function getFeedbackStatsForSlug(slug) {
  const items = load().article_feedback.filter((x) => x.slug === slug);
  const totalCount = items.length;
  const rated = items.filter((x) => x.rating != null && x.rating >= 1 && x.rating <= 5);
  const ratingCount = rated.length;
  const avgRating =
    ratingCount === 0
      ? null
      : Math.round((rated.reduce((s, x) => s + x.rating, 0) / ratingCount) * 10) / 10;
  return { totalCount, ratingCount, avgRating };
}

function listArticleFeedbackDesc(limit) {
  const n = Number(limit) > 0 ? Number(limit) : 200;
  return load()
    .article_feedback.slice()
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, n);
}

module.exports = {
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
};
