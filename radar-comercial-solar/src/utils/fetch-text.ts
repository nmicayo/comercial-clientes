const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8"
};

export const fetchText = async (
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status?: number; body?: string; finalUrl?: string; error?: string }> => {
  try {
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        finalUrl: response.url
      };
    }

    return {
      ok: true,
      status: response.status,
      body: await response.text(),
      finalUrl: response.url
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error"
    };
  }
};
