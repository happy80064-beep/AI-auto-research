/*
 * @Author: songyanan
 * @Date: 2026-06-18 11:09:10
 * @LastEditors: songyanan
 * @LastEditTime: 2026-06-18 14:58:14
 * @Description: file content
 */
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
    const url = new URL(req.url);
    console.log('请求:', url)
    
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "AutoResearch",
        runtime: "bun",
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        time: Date.now(),
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      const response = await apiHandler(req);
      return response;
    }

    if (isStaticAssetRequest(url.pathname) || url.pathname === "/") {
      const staticResponse = await staticHandler(req);
      if (staticResponse) return staticResponse;
    }

    const fallbackPath = join(distDir, "index.html");
    if (existsSync(fallbackPath)) {
      return new Response(Bun.file(fallbackPath), {
        headers: { 
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new Response(JSON.stringify({ 
      error: { message: "Build output not found. Run bun run build first." } 
    }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
});

console.log(`AutoResearch Bun server listening on http://localhost:${server.port}`);
console.log(`DeepSeek model: ${process.env.DEEPSEEK_MODEL || "deepseek-chat"}`);
