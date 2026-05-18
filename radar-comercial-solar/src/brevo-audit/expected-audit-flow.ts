export type BrevoAuditStep = {
  id: string;
  title: string;
  section: string;
  description: string;
  sidebarLabels: string[];
  expectedTerms: string[];
  manualHint: string;
};

export const BREVO_AUDIT_STEPS: BrevoAuditStep[] = [
  {
    id: "lista-prospeccao",
    title: "Lista de prospeccao",
    section: "Listas",
    description: "Confirma se a lista principal esta sendo usada como fila de entrada ou deposito historico.",
    sidebarLabels: ["Contacts", "Contatos", "Lists", "Listas"],
    expectedTerms: ["Prospecção Armazenagem PE", "Prospecao Armazenagem PE", "#15"],
    manualHint: "Abra a lista principal de prospeccao no Brevo e deixe a tela visivel antes de continuar."
  },
  {
    id: "lista-nurturing",
    title: "Lista fria de nurturing",
    section: "Listas",
    description: "Confirma se a lista fria existe e se aparece como destino real da cadencia.",
    sidebarLabels: ["Contacts", "Contatos", "Lists", "Listas"],
    expectedTerms: ["Fria-Nurturing", "Fria Nurturing", "#16"],
    manualHint: "Abra a lista de nurturing ou a area onde ela aparece como destino operacional."
  },
  {
    id: "lista-proposta",
    title: "Lista de proposta enviada",
    section: "Listas",
    description: "Confirma a lista usada para follow-up apos proposta.",
    sidebarLabels: ["Contacts", "Contatos", "Lists", "Listas"],
    expectedTerms: ["Proposta-Enviada", "Proposta Enviada", "#17"],
    manualHint: "Abra a lista usada para proposta enviada ou a area em que ela seja referenciada."
  },
  {
    id: "workflow-cadencia-fria",
    title: "Workflow da cadencia fria",
    section: "Workflows",
    description: "Valida a sequencia E1, E2 e E3 e suas dependencias principais.",
    sidebarLabels: ["Automations", "Automation", "Automações", "Automacoes", "Workflows"],
    expectedTerms: ["E1", "E2", "E3", "7 dias", "11 dias", "Prospecção Armazenagem PE"],
    manualHint: "Abra o workflow da cadencia fria com E1, E2 e E3 expandido na tela."
  },
  {
    id: "workflow-lead-quente",
    title: "Workflow de lead quente",
    section: "Workflows",
    description: "Confirma se existe gatilho para abertura, clique ou interesse.",
    sidebarLabels: ["Automations", "Automation", "Automações", "Automacoes", "Workflows"],
    expectedTerms: ["lead-quente", "lead quente", "open", "click", "notification"],
    manualHint: "Abra o workflow ou regra ligada a lead quente, abertura, clique ou alerta interno."
  },
  {
    id: "workflow-pos-proposta",
    title: "Workflow de pos-proposta",
    section: "Workflows",
    description: "Confirma follow-up apos proposta enviada.",
    sidebarLabels: ["Automations", "Automation", "Automações", "Automacoes", "Workflows"],
    expectedTerms: ["Proposta-Enviada", "3 dias", "4 dias", "D+3", "D+7"],
    manualHint: "Abra o workflow de pos-proposta ou a automacao que acompanha proposta enviada."
  },
  {
    id: "campanhas-templates",
    title: "Campanhas e templates",
    section: "Campanhas",
    description: "Confirma a existencia real de campanhas e templates associados a E1, E2 e E3.",
    sidebarLabels: ["Campaigns", "Campanhas", "Email", "Emails", "Templates"],
    expectedTerms: ["E1", "E2", "E3", "Phenyx", "Armazenagem"],
    manualHint: "Abra a area de campanhas ou templates com os itens de E1, E2 e E3 visiveis."
  },
  {
    id: "crm-proposta",
    title: "CRM e proposta",
    section: "CRM",
    description: "Confirma pipeline real de proposta e negociacao.",
    sidebarLabels: ["CRM", "Deals", "Negócios", "Negocios"],
    expectedTerms: ["Armazenagem PE", "Proposta", "Negociação", "Negociacao"],
    manualHint: "Abra o pipeline de CRM, deals ou a visao de proposta e negociacao."
  }
];
