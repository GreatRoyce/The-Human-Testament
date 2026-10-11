const bookRoutes = require("./routes/book.routes");
const errorHandler = require("./middleware/error.middleware");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
// Initialize Express app
const app = express();

// Security headers
app.use(helmet());

// Allow frontend requests.
// We will restrict this to your actual frontend origin before deployment.
app.use(cors());

// Parse incoming JSON
app.use(express.json({ limit: "1mb" }));

// Log HTTP requests during development
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "The Human Testament API is running.",
    timestamp: new Date().toISOString(),
  });
});

// Book routes
app.use("/api/books", bookRoutes);

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
