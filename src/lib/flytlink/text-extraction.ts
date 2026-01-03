import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export interface ExtractedText {
    content: string;
    pageCount?: number;
    wordCount: number;
    fileName: string;
}

/**
 * Extract text from a PDF file
 */
export async function extractPdfText(buffer: Buffer, fileName: string): Promise<ExtractedText> {
    try {
        const data = await pdfParse(buffer);
        return {
            content: data.text,
            pageCount: data.numpages,
            wordCount: data.text.split(/\s+/).filter(Boolean).length,
            fileName,
        };
    } catch (error) {
        console.error("Error extracting PDF text:", error);
        throw new Error(`Kunne ikke lese PDF: ${fileName}`);
    }
}

/**
 * Extract text from a Word document (.docx)
 */
export async function extractWordText(buffer: Buffer, fileName: string): Promise<ExtractedText> {
    try {
        const result = await mammoth.extractRawText({ buffer });
        const content = result.value;
        return {
            content,
            wordCount: content.split(/\s+/).filter(Boolean).length,
            fileName,
        };
    } catch (error) {
        console.error("Error extracting Word text:", error);
        throw new Error(`Kunne ikke lese Word-dokument: ${fileName}`);
    }
}

/**
 * Extract text from a plain text file
 */
export function extractPlainText(buffer: Buffer, fileName: string): ExtractedText {
    const content = buffer.toString("utf-8");
    return {
        content,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        fileName,
    };
}

/**
 * Extract text from any supported file type
 */
export async function extractText(buffer: Buffer, fileName: string, mimeType?: string): Promise<ExtractedText> {
    const ext = fileName.split(".").pop()?.toLowerCase();

    if (mimeType === "application/pdf" || ext === "pdf") {
        return extractPdfText(buffer, fileName);
    }

    if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        ext === "docx"
    ) {
        return extractWordText(buffer, fileName);
    }

    if (mimeType === "text/plain" || ext === "txt") {
        return extractPlainText(buffer, fileName);
    }

    // For other types, try plain text extraction
    console.warn(`Unknown file type for ${fileName}, attempting plain text extraction`);
    return extractPlainText(buffer, fileName);
}

/**
 * Split text into chunks for processing (to avoid token limits)
 */
export function splitIntoChunks(text: string, maxChunkSize: number = 4000): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
        } else {
            currentChunk += " " + sentence;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}
