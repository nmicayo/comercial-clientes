import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadPanelData, PanelActionError, sendLeadToBrevo } from "./panel-service.ts";

const projectRoot = process.cwd();
const staticDir = resolve(projectRoot, "src", "panel", "static");

const mimeTypeByExtension = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

const sendJson = (response: ServerResponse, statusCode: number, data: unknown) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(data)}\n`);
};

const sendText = (response: ServerResponse, statusCode: number, message: string) => {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(message);
};

const readRequestBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const serveStaticFile = async (response: ServerResponse, fileName: string) => {
  // Prevent path traversal: resolve and ensure it stays within staticDir
  const filePath = resolve(staticDir, fileName);

  if (!filePath.startsWith(staticDir)) {
    sendText(response, 403, "Acesso negado.");
    return;
  }

  try {
    const content = await readFile(filePath);
    const lastDot = fileName.lastIndexOf(".");
    const extension = lastDot >= 0 ? fileName.slice(lastDot) : "";
    response.writeHead(200, {
      "Content-Type": mimeTypeByExtension.get(extension) ?? "application/octet-stream"
    });
    response.end(content);
  } catch {
    sendText(response, 404, "Arquivo não encontrado.");
  }
};

const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
) => {
  if (request.method === "GET" && pathname === "/api/leads") {
    const data = await loadPanelData(projectRoot);
    sendJson(response, 200, data);
    return;
  }

  if (request.method === "POST") {
    const match = pathname.match(/^\/api\/leads\/([^/]+)\/send$/);

    if (match) {
      const bodyText = await readRequestBody(request);
      let payload: { email?: string; phone?: string; companyName?: string } = {};

      if (bodyText) {
        try {
          payload = JSON.parse(bodyText) as { email?: string; phone?: string; companyName?: string };
        } catch {
          throw new PanelActionError("Corpo JSON inválido.", 400);
        }
      }

      const result = await sendLeadToBrevo(projectRoot, decodeURIComponent(match[1]), payload);
      sendJson(response, 200, result);
      return;
    }
  }

  sendJson(response, 404, { ok: false, error: "Rota da API não encontrada." });
};

const createPanelServer = () =>
  createServer(async (request, response) => {
    try {
      if (!request.url || !request.method) {
        sendJson(response, 400, { ok: false, error: "Requisição inválida." });
        return;
      }

      const url = new URL(request.url, "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        await handleApiRequest(request, response, url.pathname);
        return;
      }

      if (request.method !== "GET") {
        sendJson(response, 405, { ok: false, error: "Método não permitido." });
        return;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        await serveStaticFile(response, "index.html");
        return;
      }

      // Serve any file under /assets/ (hashed JS/CSS from Vite build)
      if (url.pathname.startsWith("/assets/")) {
        const assetFile = url.pathname.slice(1); // strip leading "/"
        await serveStaticFile(response, assetFile);
        return;
      }

      sendText(response, 404, "Página não encontrada.");
    } catch (error) {
      if (error instanceof PanelActionError) {
        sendJson(response, error.statusCode, { ok: false, error: error.message });
        return;
      }

      const message = error instanceof Error ? error.message : "Erro interno no painel.";
      sendJson(response, 500, { ok: false, error: message });
    }
  });

export const startPanelServer = async () => {
  const { config } = await loadPanelData(projectRoot);
  const server = createPanelServer();

  server.listen(config.port, () => {
    console.log(`Painel de revisão disponível em http://localhost:${config.port}`);

    if (!config.ready && config.errors.length) {
      console.log("Avisos de configuração Brevo:");

      for (const error of config.errors) {
        console.log(`- ${error}`);
      }
    }
  });

  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startPanelServer();
}
