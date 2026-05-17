import "server-only";
import type {
  DocumentContext,
  N8nDocumentAttachment,
} from "@/lib/types";

const MAX_EXTRACTED_CHARS_PER_FILE = 18_000;
const MAX_DOCUMENT_CONTEXT_CHARS = 28_000;
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false });

const SUPPORTED_TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export function isSupportedDocumentType(type: string, name: string): boolean {
  const normalized = type.toLowerCase();
  const extension = extensionOf(name);
  return (
    normalized === "application/pdf" ||
    normalized ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    SUPPORTED_TEXT_TYPES.has(normalized) ||
    ["txt", "md", "csv", "json"].includes(extension)
  );
}

export function supportedDocumentLabel(type: string, name: string): string {
  const normalized = type.toLowerCase();
  const extension = extensionOf(name);
  if (normalized === "application/pdf" || extension === "pdf") return "PDF";
  if (
    normalized ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "DOCX";
  }
  if (extension) return extension.toUpperCase();
  return "documento";
}

export async function extractDocumentText(
  signedUrl: string,
  attachment: { name: string; type: string; size: number }
): Promise<{ text: string; truncated: boolean }> {
  const response = await fetch(signedUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Nao foi possivel baixar o documento anexado.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const normalized = attachment.type.toLowerCase();
  const extension = extensionOf(attachment.name);

  let text = "";
  if (normalized === "application/pdf" || extension === "pdf") {
    text = await extractPdfText(buffer);
  } else if (
    normalized ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    text = await extractDocxText(buffer);
  } else {
    text = TEXT_DECODER.decode(buffer);
  }

  const normalizedText = normalizeExtractedText(text);
  return trimWithFlag(normalizedText, MAX_EXTRACTED_CHARS_PER_FILE);
}

export function buildDocumentContext(
  documents: N8nDocumentAttachment[]
): DocumentContext | null {
  const usable = documents
    .filter((document) => document.text?.trim())
    .map((document) => {
      const trimmed = trimWithFlag(
        document.text ?? "",
        MAX_EXTRACTED_CHARS_PER_FILE
      );
      return {
        name: document.name,
        type: document.type,
        size: document.size,
        text: trimmed.text,
        truncated: trimmed.truncated,
      };
    });

  if (usable.length === 0) return null;

  const joined = usable
    .map(
      (document, index) =>
        `Documento ${index + 1}: ${document.name}\nTipo: ${
          document.type || "application/octet-stream"
        }\nConteudo:\n${document.text}`
    )
    .join("\n\n---\n\n");
  const trimmed = trimWithFlag(joined, MAX_DOCUMENT_CONTEXT_CHARS);
  const truncatedFiles = usable
    .filter((document) => document.truncated)
    .map((document) => document.name);
  const limitations = [
    trimmed.truncated ? "Contexto total truncado por limite de tamanho." : "",
    truncatedFiles.length
      ? `Documentos truncados: ${truncatedFiles.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    documents: usable,
    text: trimmed.text,
    limitations,
  };
}

export function formatDocumentContext(context: DocumentContext): string {
  return [
    context.text ? `Conteudo dos documentos:\n${context.text}` : "",
    context.limitations ? `Limitacoes: ${context.limitations}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

function trimWithFlag(
  value: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return {
    text: `${value.slice(0, maxChars).trim()}\n\n[conteudo truncado]`,
    truncated: true,
  };
}

function extensionOf(name: string): string {
  const clean = name.toLowerCase().split("?")[0] ?? "";
  const parts = clean.split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}
