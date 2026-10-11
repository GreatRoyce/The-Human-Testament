
const express = require("express");

const {
  getBooks,
  getBookBySlug,
  getChapter,
} = require("../controllers/book.controller");

const router = express.Router();

router.get("/", getBooks);
router.get("/:slug", getBookBySlug);
router.get("/:slug/chapters/:chapterNumber", getChapter);

module.exports = router;
