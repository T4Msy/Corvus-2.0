export type CompatibilityLevel = "stable" | "masayoshi" | "experimental";

export interface UnicodeStyleDefinition {
  id: string;
  name: string;
  description: string;
  level: CompatibilityLevel;
  mobileSafe: boolean;
  premium?: boolean;
  prefix?: string;
  suffix?: string;
  separator?: string;
  transform?: Partial<Record<"upper" | "lower" | "numbers", readonly string[]>>;
  replacements?: Record<string, string>;
}

export interface GeneratedTextVariant {
  id: string;
  name: string;
  description: string;
  level: CompatibilityLevel;
  mobileSafe: boolean;
  premium: boolean;
  text: string;
}

export interface SymbolCategory {
  id: string;
  name: string;
  description: string;
  symbols: readonly string[];
  premium?: boolean;
}
