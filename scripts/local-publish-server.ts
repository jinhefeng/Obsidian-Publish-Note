import http from "node:http";
import { InMemoryPublisher } from "../src/publish/in-memory-publisher.ts";
import { serveLocalSite } from "../src/publish/local-viewer.ts";

const port = Number(process.env.SHARE_PORT || 8787);
const host = process.env.SHARE_HOST || "127.0.0.1";
const token = process.env.SHARE_DEV_TOKEN || "dev-token";
const baseUrl = process.env.SHARE_BASE_URL || `http://${host}:${port}`;
const defaultMaxBodyBytes = Number(process.env.SHARE_MAX_BODY_BYTES || 100_000_000);

function readJson(request, maxBodyBytes = defaultMaxBodyBytes) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodyBytes = 0;
    let rejected = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (rejected) return;
      const text = String(chunk);
      bodyBytes += Buffer.byteLength(text, "utf8");
      body += text;
      if (bodyBytes > maxBodyBytes) {
        rejected = true;
        const error = new Error(`Request body too large (maximum ${maxBodyBytes} bytes)`);
        error.statusCode = 413;
        reject(error);
      }
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end(body);
}

function sendPage(response, result) {
  response.writeHead(result.status, {
    "content-type": result.contentType,
    "access-control-allow-origin": "*",
  });
  response.end(result.body);
}

export function createLocalPublishServer(options = {}) {
  const serverPort = options.port ?? port;
  const serverBaseUrl = options.baseUrl ?? `http://127.0.0.1:${serverPort}`;
  const serverToken = options.token ?? token;
  const maxBodyBytes = options.maxBodyBytes ?? defaultMaxBodyBytes;
  const publisher = new InMemoryPublisher(serverBaseUrl);

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", serverBaseUrl);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
      });
      response.end();
      return;
    }

    if (requestUrl.pathname.startsWith("/v1/")) {
      if (request.headers.authorization !== `Bearer ${serverToken}`) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      if (request.method !== "POST" && request.method !== "PUT") {
        sendJson(response, 405, { error: "Method Not Allowed" });
        return;
      }

      try {
        const payload = await readJson(request, maxBodyBytes);
        if (request.method === "POST" && requestUrl.pathname === "/v1/sites/uploads") {
          const result = publisher.startUpload(payload);
          sendJson(response, 200, result);
          return;
        }

        const uploadChunkMatch = /^\/v1\/uploads\/([^/]+)\/chunks$/.exec(requestUrl.pathname);
        if (request.method === "POST" && uploadChunkMatch) {
          const result = publisher.uploadChunk({
            ...payload,
            uploadId: decodeURIComponent(uploadChunkMatch[1]),
          });
          sendJson(response, 200, result);
          return;
        }

        const uploadCommitMatch = /^\/v1\/uploads\/([^/]+)\/commit$/.exec(requestUrl.pathname);
        if (request.method === "POST" && uploadCommitMatch) {
          const result = publisher.commitUpload({ uploadId: decodeURIComponent(uploadCommitMatch[1]) });
          sendJson(response, 200, result);
          return;
        }

        const siteMatch = /^\/v1\/sites\/([^/]+)$/.exec(requestUrl.pathname);
        if (request.method === "POST" && requestUrl.pathname !== "/v1/sites") {
          sendJson(response, 404, { error: "Not Found" });
          return;
        }
        if (request.method === "PUT" && !siteMatch) {
          sendJson(response, 404, { error: "Not Found" });
          return;
        }

        const result = publisher.publish({
          ...payload,
          ...(siteMatch ? { siteId: decodeURIComponent(siteMatch[1]) } : {}),
        });
        sendJson(response, 200, result);
      } catch (error) {
        const status = Number(error?.statusCode) === 413 ? 413 : 400;
        sendJson(response, status, { error: error instanceof Error ? error.message : "Bad Request" });
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname.startsWith("/s/")) {
      const siteMatch = /^\/s\/([^/]+)(\/.*)?$/.exec(requestUrl.pathname);
      if (!siteMatch) {
        sendJson(response, 404, { error: "Not Found" });
        return;
      }
      try {
        sendPage(response, serveLocalSite(publisher, decodeURIComponent(siteMatch[1]), requestUrl.pathname));
      } catch {
        sendJson(response, 404, { error: "Not Found" });
      }
      return;
    }

    sendJson(response, 404, { error: "Not Found" });
  });

  return { server, publisher };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { server } = createLocalPublishServer();
  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`One-Click Publish server cannot start: ${host}:${port} is already in use.`);
      console.error("Use ./start.sh status to inspect the existing service, or ./start.sh restart to restart this project service.");
    } else {
      console.error("One-Click Publish server failed:", error);
    }
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`Local publish server listening at ${baseUrl}`);
    console.log(`Development token: ${token}`);
  });
}
