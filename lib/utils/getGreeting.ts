const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

type GreetingPeriod = "madrugada" | "dia" | "tarde" | "noite";

interface GetGreetingOptions {
  date?: Date;
  timeZone?: string;
}

const GREETINGS: Record<GreetingPeriod, string> = {
  madrugada: "Boa madrugada",
  dia: "Bom dia",
  tarde: "Boa tarde",
  noite: "Boa noite",
};

export function getGreeting(
  name?: string | null,
  options: GetGreetingOptions = {}
): string {
  const period = getGreetingPeriod(
    getHourInTimeZone(options.date ?? new Date(), options.timeZone ?? DEFAULT_TIME_ZONE)
  );
  const greeting = GREETINGS[period];
  const cleanName = normalizeName(name);

  return cleanName ? `${greeting}, ${cleanName}.` : `${greeting}.`;
}

export function getGreetingPeriod(hour: number): GreetingPeriod {
  if (hour >= 0 && hour < 5) return "madrugada";
  if (hour >= 5 && hour < 12) return "dia";
  if (hour >= 12 && hour < 18) return "tarde";
  return "noite";
}

function getHourInTimeZone(date: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
      timeZone,
    }).formatToParts(date).find((part) => part.type === "hour")?.value;

    const parsed = Number(hour);
    return Number.isFinite(parsed) ? parsed : date.getHours();
  } catch {
    return date.getHours();
  }
}

function normalizeName(name?: string | null): string {
  return typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
}
