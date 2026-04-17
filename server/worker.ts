// Cloudflare provides this module at bundle/runtime; plain tsc does not resolve it.
// @ts-ignore
import { httpServerHandler } from "cloudflare:node";

const workerPort = Number(process.env.PORT ?? 3000) || 3000;
process.env.PORT = String(workerPort);

await import("./index.js");

export default httpServerHandler({ port: workerPort });
