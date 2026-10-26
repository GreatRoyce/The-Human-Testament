const bookRoutes = require("./routes/book.routes");
const errorHandler = require("./middleware/error.middleware");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { authCorsOptions, isAccountPath } = require('./config/auth');
// Initialize Express app
const app = express();

// Security headers
app.use(helmet());

// Auth uses an explicit credentialed origin allowlist; public content stays open.
app.use(cors(authCorsOptions));

// Parse incoming JSON
app.use('/api/analytics', express.json({ limit: '2kb', inflate: false }));
app.use('/api/auth', express.json({ limit: '8kb', inflate: false }));
app.use('/api/admin', express.json({ limit: '8kb', inflate: false }));
app.use(express.json({ limit: "1mb", inflate: false }));

// Log HTTP requests during development
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev", { skip: req => isAccountPath(req.originalUrl.split('?')[0]) }));
}

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "The Human Testament API is running.",
    timestamp: new Date().toISOString(),
  });
});

// Readiness is separate from liveness and never exposes infrastructure details.
app.get('/api/ready', require('./services/runtimeReadiness').readinessHandler);

// Book routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/admin', require('./routes/administration.routes'));
const personalLibrary = require('./routes/personalLibrary.routes');
app.use('/api/bookmarks', personalLibrary.bookmarks);
app.use('/api/notes', personalLibrary.notes);
const reading = require('./routes/reading.routes');
app.use('/api/reading-progress', reading.progress);
app.use('/api/reading-history', reading.history);
const community = require('./routes/community.routes');
app.use('/api/articles', require('./routes/article.routes'));
app.use('/api', (req, res, next) => /^\/(?:discussions|comments|reading-circles|reports|moderation)(?:\/|$)/.test(req.path) ? community(req, res, next) : next());
app.use("/api/books", bookRoutes);
const contentController = require('./controllers/book.controller');
app.get('/api/verses/:canonicalId', contentController.getVerseById);
app.get('/api/glossary', contentController.getGlossary);
app.get('/api/cross-references', contentController.getCrossReferences);
app.get('/api/cross-references/index', contentController.getIndex);
app.get('/api/sections', contentController.getSections);
app.get('/api/search', require('./middleware/search.middleware'), contentController.search);

// Handle unknown routes (must come after all routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
