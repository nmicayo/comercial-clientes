import { resolve } from "node:path";
import { readJsonArtifact } from "../storage/json-artifact-store.ts";
import { BrevoClient } from "./brevo-client.ts";
import type { BrevoDeliveryAttempt } from "../contracts/lead-types.ts";

const STATUS_ICON: Record<string, string> = {
  abriu: "✅",
  nao_abriu: "📭",
  bounce: "❌",
  descadastrou: "🚫",
  erro: "⚠️"
};

export const auditBrevo = async (projectRoot: string, options: { apiKey: string; listId: number; days?: number }) => {
  const { apiKey, listId, days = 30 } = options;
  const attemptsPath = resolve(projectRoot, "data", "brevo-envios.json");
  const attempts = await readJsonArtifact<BrevoDeliveryAttempt[]>(attemptsPath, []);
  const brevo = new BrevoClient(apiKey);

  const enviados = attempts.filter(
    (a) => a.statusEnvio === "enviado" && a.brevoListId === listId
  );

  if (enviados.length === 0) {
    console.log(`Nenhum contato enviado para a lista #${listId}.`);
    return;
  }

  console.log(`\nAuditoria — lista #${listId} (${enviados.length} contatos enviados)\n`);
  console.log("Consultando Brevo...\n");

  const resultados: Array<{
    company: string;
    email: string;
    sentAt: string;
    opened: boolean;
    clicked: boolean;
    bounced: boolean;
    unsubscribed: boolean;
  }> = [];

  for (const attempt of enviados) {
    const email = attempt.emailNormalizado;
    try {
      const events = await brevo.getEmailEvents(email, days);
      const opened = events.some((e) => e.event === "opened");
      const clicked = events.some((e) => e.event === "clicks");
      const bounced = events.some((e) => ["hardBounce", "softBounce", "blocked", "invalid"].includes(e.event));
      const unsubscribed = events.some((e) => e.event === "unsubscribed");

      resultados.push({
        company: attempt.companyName ?? email,
        email,
        sentAt: attempt.attemptedAt?.slice(0, 10) ?? "",
        opened,
        clicked,
        bounced,
        unsubscribed
      });
    } catch {
      resultados.push({
        company: attempt.companyName ?? email,
        email,
        sentAt: attempt.attemptedAt?.slice(0, 10) ?? "",
        opened: false,
        clicked: false,
        bounced: false,
        unsubscribed: false
      });
    }
  }

  // ordena: abriu primeiro, depois não abriu, depois bounce
  resultados.sort((a, b) => {
    if (a.bounced !== b.bounced) return a.bounced ? 1 : -1;
    if (a.opened !== b.opened) return a.opened ? -1 : 1;
    return 0;
  });

  const abriram = resultados.filter((r) => r.opened);
  const naoAbriram = resultados.filter((r) => !r.opened && !r.bounced && !r.unsubscribed);
  const bounces = resultados.filter((r) => r.bounced);
  const descadastrados = resultados.filter((r) => r.unsubscribed);

  for (const r of resultados) {
    let status = "nao_abriu";
    if (r.bounced) status = "bounce";
    else if (r.unsubscribed) status = "descadastrou";
    else if (r.opened) status = "abriu";

    const clickedMark = r.clicked ? " 🖱️" : "";
    console.log(`${STATUS_ICON[status]} ${r.sentAt}  ${r.company.padEnd(38)}  ${r.email}${clickedMark}`);
  }

  console.log(`
Resumo
------
✅ Abriram:        ${abriram.length}
📭 Não abriram:   ${naoAbriram.length}
❌ Bounce:         ${bounces.length}
🚫 Descadastraram: ${descadastrados.length}
`);

  if (abriram.length > 0) {
    console.log("Abriram — ação recomendada: follow-up personalizado");
    abriram.forEach((r) => console.log(`  → ${r.company} <${r.email}>`));
    console.log("");
  }

  if (bounces.length > 0) {
    console.log("Bounces — remover ou corrigir e-mail:");
    bounces.forEach((r) => console.log(`  → ${r.company} <${r.email}>`));
    console.log("");
  }
};
