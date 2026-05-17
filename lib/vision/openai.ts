import "server-only";
import type { N8nImageAttachment, VisualContext } from "@/lib/types";

const DEFAULT_MODEL = "gpt-4o-mini";

type ResponsesEnvelope = {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      text?: unknown;
      value?: unknown;
    }>;
  }>;
};

function firstText(value: ResponsesEnvelope): string {
  if (typeof value.output_text === "string") return value.output_text;
  for (const item of value.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") return part.text;
      if (typeof part.value === "string") return part.value;
    }
  }
  return "";
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    const clean = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      const parsed = JSON.parse(clean);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeContext(text: string): VisualContext {
  const parsed = parseJsonObject(text);
  const confidence = Number(parsed.confidence ?? parsed.confianca ?? 0.7);
  return {
    ocrText: asString(parsed.ocrText ?? parsed.ocr),
    description:
      asString(parsed.description ?? parsed.descricao) || text.trim(),
    relevantItems: asStringArray(parsed.relevantItems ?? parsed.itens),
    limitations: asString(parsed.limitations ?? parsed.limitacoes),
    confidence: Number.isFinite(confidence) ? confidence : 0.7,
  };
}

export function formatVisualContext(context: VisualContext): string {
  return [
    context.ocrText ? `OCR: ${context.ocrText}` : "",
    context.description ? `Descricao: ${context.description}` : "",
    context.relevantItems.length
      ? `Itens: ${context.relevantItems.join(", ")}`
      : "",
    context.limitations ? `Limitacoes: ${context.limitations}` : "",
    Number.isFinite(context.confidence)
      ? `Confianca: ${context.confidence}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function analyzeImagesWithOpenAI(
  message: string,
  images: N8nImageAttachment[]
): Promise<{ context: VisualContext; text: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || images.length === 0) return null;

  const imageInputs = images
    .map((image) => image.dataUrl || image.imageUrl || image.url || image.signedUrl)
    .filter(Boolean)
    .slice(0, 4);
  if (imageInputs.length === 0) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL,
      temperature: 0,
      max_output_tokens: 900,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Analise a imagem anexada para o Corvus. Responda SOMENTE JSON valido com as chaves: ocrText, description, relevantItems, limitations, confidence. Descreva objetivamente o que aparece, pessoas, objetos, texto visivel, ambiente, cores e qualquer detalhe relevante. Mensagem do usuario: " +
                message,
            },
            ...imageInputs.map((imageUrl) => ({
              type: "input_image",
              image_url: imageUrl,
              detail: "auto",
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const raw = (await response.json().catch(() => null)) as ResponsesEnvelope | null;
  if (!raw) return null;

  const text = firstText(raw).trim();
  if (!text) return null;

  const context = normalizeContext(text);
  const formatted = formatVisualContext(context);
  return formatted ? { context, text: formatted } : null;
}

export function looksLikeImageRefusal(reply: string): boolean {
  const normalized = reply
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  return (
    normalized.includes("nao posso analisar imagens") ||
    normalized.includes("nao possui essa capacidade") ||
    normalized.includes("nao consigo visualizar") ||
    normalized.includes("capacidade de visualizar imagens") ||
    normalized.includes("descreva a imagem") ||
    normalized.includes("posso ajudar em texto")
  );
}

export function directVisionReply(contextText: string): string {
  const description =
    contextText
      .split("\n")
      .find((line) => line.toLowerCase().startsWith("descricao:"))
      ?.replace(/^Descricao:\s*/i, "")
      .trim() || contextText;

  return `Analisei a imagem: ${description}`;
}
