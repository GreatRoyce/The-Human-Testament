
const fs = require("node:fs");
const path = require("node:path");
const mammoth = require("mammoth");

const docxPath = path.join(
  __dirname,
  "../data/The-Human-Testament-Clean-Ingestion-Edition.docx",
);

const outputPath = path.join(
  __dirname,
  "../data/manuscript-extracted.txt",
);

async function extractManuscript() {
  if (!fs.existsSync(docxPath)) {
    throw new Error(`Clean ingestion DOCX not found: ${docxPath}`);
  }

  const result = await mammoth.extractRawText({ path: docxPath });
  const extractedText = result.value;

  if (!extractedText || !extractedText.trim()) {
    throw new Error("No readable text was extracted from the DOCX.");
  }

  // Preserve the previous extraction for comparison.
  if (fs.existsSync(outputPath)) {
    const backupPath = path.join(
      __dirname,
      "../data/manuscript-extracted-original-pdf.txt",
    );

    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(outputPath, backupPath);
      console.log(`Previous extraction preserved: ${backupPath}`);
    }
  }

  fs.writeFileSync(outputPath, extractedText, "utf8");

  console.log("Clean ingestion DOCX extraction completed.");
  console.log(`Extracted characters: ${extractedText.length}`);
  console.log(`Output: ${outputPath}`);

  if (result.messages.length > 0) {
    console.log("DOCX extraction messages:");
    result.messages.forEach((message) => {
      console.log(`- ${message.message}`);
    });
  }

  console.log("MongoDB was not modified.");
}

extractManuscript().catch((error) => {
  console.error("Extraction failed:", error.message);
  process.exitCode = 1;
});
