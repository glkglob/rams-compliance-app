interface ExtractionResult {
  status: "complete" | "failed";
  extractedText?: string;
  confidence: number;
  requiresManualReview: boolean;
  issues: string[];
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractionResult> {
  try {
    switch (mimeType) {
      case "application/pdf":
        return await extractFromPDF(fileBuffer);

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      case "application/msword":
        return await extractFromWord(fileBuffer);

      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      case "application/vnd.ms-excel":
        return await extractFromExcel(fileBuffer);

      case "text/csv":
        return extractFromCSV(fileBuffer);

      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        return await extractFromPPTX(fileBuffer);

      case "text/plain":
        return extractFromTxt(fileBuffer);

      case "image/jpeg":
      case "image/png":
        return await extractFromImage(fileBuffer);

      default:
        return {
          status: "failed",
          confidence: 0,
          requiresManualReview: true,
          issues: [`Unsupported file type: ${mimeType}`],
        };
    }
  } catch (error) {
    console.error(`Error extracting text from ${fileName}:`, error);
    return {
      status: "failed",
      confidence: 0,
      requiresManualReview: true,
      issues: [`Text extraction failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // pdf-parse ESM build exports the function directly, not as `.default`
    const pdfParseModule = await import("pdf-parse");
    type PdfFn = (buf: Buffer) => Promise<{ text: string }>;
    const pdfParse = ((pdfParseModule as unknown as { default?: PdfFn }).default
      ?? pdfParseModule) as PdfFn;
    const data = await pdfParse(buffer);

    const text = data.text.trim();
    if (text.length > 0) {
      return {
        status: "complete",
        extractedText: text,
        confidence: 0.95,
        requiresManualReview: false,
        issues: [],
      };
    }

    return await extractFromImage(buffer);
  } catch {
    console.warn("Native PDF extraction failed, falling back to OCR");
    return await extractFromImage(buffer);
  }
}

async function extractFromWord(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer });

  return {
    status: "complete",
    extractedText: result.value.trim(),
    confidence: 0.95,
    requiresManualReview: false,
    issues: result.messages.map((m) => m.message),
  };
}

async function extractFromExcel(buffer: Buffer): Promise<ExtractionResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });

  let allText = "";
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csvText = XLSX.utils.sheet_to_csv(sheet);
    allText += `Sheet: ${sheetName}\n${csvText}\n\n`;
  });

  return {
    status: "complete",
    extractedText: allText.trim(),
    confidence: 0.9,
    requiresManualReview: false,
    issues: [],
  };
}

function extractFromCSV(buffer: Buffer): ExtractionResult {
  return {
    status: "complete",
    extractedText: buffer.toString("utf-8").trim(),
    confidence: 0.95,
    requiresManualReview: false,
    issues: [],
  };
}

async function extractFromPPTX(buffer: Buffer): Promise<ExtractionResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  let allText = "";
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.match(/ppt\/slides\/slide\d+\.xml/))
    .sort();

  for (const slideFile of slideFiles) {
    const content = await zip.files[slideFile].async("text");
    const textMatches = content.match(/<a:t>([^<]+)<\/a:t>/g) ?? [];
    const slideText = textMatches
      .map((match) => match.replace(/<\/?a:t>/g, ""))
      .join(" ");

    if (slideText.trim()) {
      allText += slideText + "\n";
    }
  }

  return {
    status: "complete",
    extractedText: allText.trim(),
    confidence: 0.85,
    requiresManualReview: false,
    issues: [],
  };
}

function extractFromTxt(buffer: Buffer): ExtractionResult {
  return {
    status: "complete",
    extractedText: buffer.toString("utf-8").trim(),
    confidence: 1.0,
    requiresManualReview: false,
    issues: [],
  };
}

const MAX_OCR_BYTES = 50 * 1024 * 1024; // 50 MB
const OCR_TIMEOUT_MS = 30_000;           // 30 s

async function extractFromImage(buffer: Buffer): Promise<ExtractionResult> {
  if (buffer.length > MAX_OCR_BYTES) {
    return {
      status: "failed",
      confidence: 0,
      requiresManualReview: true,
      issues: [
        `File too large for OCR (${(buffer.length / 1024 / 1024).toFixed(1)} MB — max 50 MB)`,
      ],
    };
  }

  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");

    const ocrTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OCR timed out after 30 s")), OCR_TIMEOUT_MS)
    );

    let text: string;
    let confidence: number;
    try {
      ({ data: { text, confidence } } = await Promise.race([
        worker.recognize(buffer),
        ocrTimeout,
      ]));
    } finally {
      await worker.terminate();
    }

    return {
      status: "complete",
      extractedText: text.trim(),
      confidence: confidence / 100,
      requiresManualReview: confidence < 70,
      issues:
        confidence < 70
          ? ["Low OCR confidence. Manual review may be required."]
          : [],
    };
  } catch (error) {
    return {
      status: "failed",
      confidence: 0,
      requiresManualReview: true,
      issues: [
        `OCR failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}
