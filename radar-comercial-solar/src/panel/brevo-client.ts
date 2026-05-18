type BrevoIdentifierType = "email_id" | "phone_id";

export type BrevoContactStats = {
  email: string;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
};

export type BrevoEmailEvent = {
  email: string;
  event: string;
  date: string;
  subject?: string;
  messageId?: string;
};

type BrevoContactLookupResult = {
  found: boolean;
  contactId?: number;
  emailBlacklisted?: boolean;
  data?: unknown;
};

type BrevoCreateContactPayload = {
  email: string;
  attributes?: Record<string, string>;
  listIds: number[];
  updateEnabled: boolean;
};

type BrevoCreateContactResult = {
  id?: number;
  data?: unknown;
};

export class BrevoRequestError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly data?: unknown;

  constructor(
    message: string,
    status?: number,
    code?: string,
    data?: unknown
  ) {
    super(message);
    this.name = "BrevoRequestError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export class BrevoClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    apiKey: string,
    timeoutMs = 8000
  ) {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async findContactByEmail(email: string): Promise<BrevoContactLookupResult> {
    return this.findContactByIdentifier(email, "email_id");
  }

  async findContactByPhone(phone: string): Promise<BrevoContactLookupResult> {
    return this.findContactByIdentifier(phone, "phone_id");
  }

  async createContact(payload: BrevoCreateContactPayload): Promise<BrevoCreateContactResult> {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const code = typeof data === "object" && data && "code" in data ? String(data.code) : undefined;
      const message = typeof data === "object" && data && "message" in data ? String(data.message) : "Erro ao criar contato na Brevo.";
      throw new BrevoRequestError(message, response.status, code, data);
    }

    const id = typeof data === "object" && data && "id" in data && typeof data.id === "number" ? data.id : undefined;

    return { id, data };
  }

  async getContactStats(email: string): Promise<BrevoContactStats> {
    const url = `https://api.brevo.com/v3/smtp/statistics/contacts/${encodeURIComponent(email)}`;
    const response = await fetch(url, {
      headers: { "api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const message = typeof data === "object" && data && "message" in data ? String(data.message) : "Erro ao consultar estatísticas.";
      throw new BrevoRequestError(message, response.status, undefined, data);
    }

    const d = data as Record<string, unknown>;
    return {
      email,
      delivered: Number(d.delivered ?? 0),
      opened: Number(d.opened ?? 0),
      clicked: Number(d.clicked ?? 0),
      bounced: Number(d.bounced ?? 0),
      unsubscribed: Number(d.unsubscribed ?? 0),
      complained: Number(d.complained ?? 0)
    };
  }

  async getEmailEvents(email: string, days = 30): Promise<BrevoEmailEvent[]> {
    const params = new URLSearchParams({ email, days: String(days), limit: "50", offset: "0" });
    const url = `https://api.brevo.com/v3/smtp/statistics/events?${params}`;
    const response = await fetch(url, {
      headers: { "api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const message = typeof data === "object" && data && "message" in data ? String(data.message) : "Erro ao consultar eventos.";
      throw new BrevoRequestError(message, response.status, undefined, data);
    }

    const events = (data as Record<string, unknown>).events;
    if (!Array.isArray(events)) return [];

    return events.map((e: Record<string, unknown>) => ({
      email: String(e.email ?? email),
      event: String(e.event ?? ""),
      date: String(e.date ?? ""),
      subject: e.subject ? String(e.subject) : undefined,
      messageId: e["message-id"] ? String(e["message-id"]) : undefined
    }));
  }

  private async findContactByIdentifier(
    identifier: string,
    identifierType: BrevoIdentifierType
  ): Promise<BrevoContactLookupResult> {
    const url = `https://api.brevo.com/v3/contacts/${encodeURIComponent(identifier)}?identifierType=${identifierType}`;
    const response = await fetch(url, {
      headers: {
        "api-key": this.apiKey
      },
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    const data = await parseResponseBody(response);

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      const code = typeof data === "object" && data && "code" in data ? String(data.code) : undefined;
      const message = typeof data === "object" && data && "message" in data ? String(data.message) : "Erro ao consultar contato na Brevo.";
      throw new BrevoRequestError(message, response.status, code, data);
    }

    const contactId = typeof data === "object" && data && "id" in data && typeof data.id === "number" ? data.id : undefined;
    const emailBlacklisted = typeof data === "object" && data && "emailBlacklisted" in data ? Boolean(data.emailBlacklisted) : undefined;

    return {
      found: true,
      contactId,
      emailBlacklisted,
      data
    };
  }
}
