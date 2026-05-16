import type { Conversation } from "@/lib/types";

export function exportConversationAsMarkdown(conversation: Conversation): void {
  const createdDate = new Date(conversation.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const lines: string[] = [
    `# ${conversation.title}`,
    ``,
    `> Criada em ${createdDate} · Exportada em ${new Date().toLocaleDateString("pt-BR")}`,
  ];

  if (conversation.tags?.length) {
    lines.push(`> Tags: ${conversation.tags.map((t) => `\`${t}\``).join(", ")}`);
  }

  if (conversation.summary) {
    lines.push(``, `## Resumo`, ``, conversation.summary);
  }

  lines.push(``, `---`, ``);

  for (const message of conversation.messages ?? []) {
    const speaker = message.role === "corvus" ? "**Corvus**" : "**Você**";
    const time = new Date(message.createdAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`### ${speaker} — ${time}`, ``, message.text, ``);
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(conversation.title)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .slice(0, 48) || "conversa"
  );
}
