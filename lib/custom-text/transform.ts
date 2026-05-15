import { SOURCE_ALPHABETS } from "@/lib/custom-text/catalog";
import type { GeneratedTextVariant, UnicodeStyleDefinition } from "@/lib/custom-text/types";

const COMBINING_MARKS = /[\u0300-\u036f]/g;

function buildMap(style: UnicodeStyleDefinition) {
  const map = new Map<string, string>();

  if (style.transform?.upper) {
    SOURCE_ALPHABETS.upper.forEach((source, index) => {
      const target = style.transform?.upper?.[index];
      if (target) map.set(source, target);
    });
  }

  if (style.transform?.lower) {
    SOURCE_ALPHABETS.lower.forEach((source, index) => {
      const target = style.transform?.lower?.[index];
      if (target) map.set(source, target);
    });
  }

  if (style.transform?.numbers) {
    SOURCE_ALPHABETS.numbers.forEach((source, index) => {
      const target = style.transform?.numbers?.[index];
      if (target) map.set(source, target);
    });
  }

  for (const [source, target] of Object.entries(style.replacements ?? {})) {
    map.set(source, target);
    map.set(source.toUpperCase(), target.toUpperCase());
  }

  return map;
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = Intl.Segmenter;
    const segmenter = new Segmenter("pt-BR", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }

  return Array.from(text);
}

function transformGrapheme(grapheme: string, map: Map<string, string>) {
  const direct = map.get(grapheme);
  if (direct) return direct;

  const normalized = grapheme.normalize("NFD");
  const base = normalized.replace(COMBINING_MARKS, "");
  if (base.length !== 1) return grapheme;

  const transformed = map.get(base);
  if (!transformed) return grapheme;

  const marks = normalized.match(COMBINING_MARKS)?.join("") ?? "";
  return `${transformed}${marks}`;
}

export function transformText(text: string, style: UnicodeStyleDefinition): string {
  const map = buildMap(style);
  const parts = splitGraphemes(text).map((grapheme) => {
    const transformed = transformGrapheme(grapheme, map);
    if (!style.separator || transformed.trim() === "") return transformed;
    return `${transformed}${style.separator}`;
  });

  return `${style.prefix ?? ""}${parts.join("")}${style.suffix ?? ""}`;
}

export function generateTextVariants(
  text: string,
  styles: readonly UnicodeStyleDefinition[]
): GeneratedTextVariant[] {
  return styles.map((style) => ({
    id: style.id,
    name: style.name,
    description: style.description,
    level: style.level,
    mobileSafe: style.mobileSafe,
    premium: Boolean(style.premium),
    text: text ? transformText(text, style) : "",
  }));
}
