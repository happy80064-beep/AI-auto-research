import { existsSync } from "fs";
import { join, resolve } from "path";
import runtime from "./functions/shared/deepseekRuntime.cjs";

const {
  createApiHandler,
  createBunStaticHandler,
  createJsonResponse,
  handleCors,
  isStaticAssetRequest,
} = runtime;

const rootDir = resolve(".");
const distDir = join(rootDir, "dist");
const port = Number(process.env.PORT || 8080);

const apiHandler = createApiHandler({
  runtime: "bun",
  enablePersistentCache: true,
});
const staticHandler = createBunStaticHandler(distDir);

const server = Bun.serve({
  port,
  async fetch(req) {
    const cors = handleCors(req);
    if (cors) return cors;

    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return createJsonResponse({
        ok: true,
        service: "AutoResearch",
        runtime: "bun",
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        time: Date.now(),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return apiHandler(req);
    }

    if (isStaticAssetRequest(url.pathname) || url.pathname === "/") {
      const staticResponse = await staticHandler(req);
      if (staticResponse) return staticResponse;
    }

    const fallbackPath = join(distDir, "index.html");
    if (existsSync(fallbackPath)) {
      return new Response(Bun.file(fallbackPath), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return createJsonResponse(
      { error: { message: "Build output not found. Run bun run build first." } },
      404,
    );
  },
});

console.log(`AutoResearch Bun server listening on http://localhost:${server.port}`);
console.log(`DeepSeek model: ${process.env.DEEPSEEK_MODEL || "deepseek-chat"}`);
