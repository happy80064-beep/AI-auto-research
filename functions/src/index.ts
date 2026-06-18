import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const {
  createApiHandler,
  createJsonResponse,
  handleCors,
} = require("../shared/deepseekRuntime.cjs");

const REGION = "us-central1";
const apiHandler = createApiHandler({
  runtime: "firebase-functions",
  enablePersistentCache: true,
});

const wrapApi = (routeName: string) => functions.region(REGION).https.onRequest(async (req, res) => {
  const corsResponse = handleCors(new Request(`https://functions.local/api/${routeName}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
  }));

  if (corsResponse) {
    res.status(corsResponse.status);
    corsResponse.headers.forEach((value: string, key: string) => res.set(key, value));
    res.send("");
    return;
  }

  const request = new Request(`https://functions.local/api/${routeName}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body || {}),
  });

  const response = await apiHandler(request);
  res.status(response.status);
  response.headers.forEach((value: string, key: string) => res.set(key, value));
  const text = await response.text();
  res.send(text);
});

export const generateResearchPlan = wrapApi("generateResearchPlan");
export const refineResearchPlan = wrapApi("refineResearchPlan");
export const analyzeTranscripts = wrapApi("analyzeTranscripts");
export const generateProjectReport = wrapApi("generateProjectReport");

export const getTaskStatus = functions.region(REGION).https.onRequest(async (req, res) => {
  const id = String(req.query.id || "");
  if (!id) {
    const response = createJsonResponse({ error: { message: "Missing task id" } }, 400);
    res.status(response.status).send(await response.text());
    return;
  }

  const request = new Request(`https://functions.local/api/tasks/${id}`, {
    method: "GET",
    headers: req.headers as HeadersInit,
  });
  const response = await apiHandler(request);
  res.status(response.status);
  response.headers.forEach((value: string, key: string) => res.set(key, value));
  res.send(await response.text());
});
