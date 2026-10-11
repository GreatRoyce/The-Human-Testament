
const Book = require("../models/Book");
const Chapter = require("../models/Chapter");
const Verse = require("../models/Verse");

// GET /api/books
const getBooks = async (req, res, next) => {
  try {
    const books = await Book.find({ isPublished: true })
      .select("title slug order description")
      .sort({ order: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/books/:slug
const getBookBySlug = async (req, res, next) => {
  try {
    const book = await Book.findOne({
      slug: req.params.slug,
      isPublished: true,
    })
      .select("title slug order description")
      .lean();

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: book,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/books/:slug/chapters/:chapterNumber
const getChapter = async (req, res, next) => {
  try {
    const chapterNumber = Number(req.params.chapterNumber);

    if (
      !Number.isSafeInteger(chapterNumber) ||
      chapterNumber < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Chapter number must be a positive integer.",
      });
    }

    const book = await Book.findOne({
      slug: req.params.slug,
      isPublished: true,
    }).select("_id title slug");

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    const chapter = await Chapter.findOne({
      book: book._id,
      number: chapterNumber,
      isPublished: true,
    }).lean();

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Chapter not found.",
      });
    }

    const verses = await Verse.find({
      chapter: chapter._id,
      book: book._id,
      isPublished: true,
    })
      .select("canonicalId number text sourceVersion")
      .sort({ number: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        book,
        chapter: {
          number: chapter.number,
          title: chapter.title,
        },
        verses,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBooks,
  getBookBySlug,
  getChapter,
};
