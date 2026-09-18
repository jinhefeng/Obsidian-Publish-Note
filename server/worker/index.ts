import { createService } from "./env.ts";
import { routeRequest } from "./routes.ts";
import type { WorkerEnv } from "./env.ts";

interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void; }

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContextLike): Promise<Response> {
    const service = createService(env, request);
    return routeRequest({ service, request, env: env as unknown as Record<string, unknown> });
  },
  async scheduled(_controller: unknown, env: WorkerEnv, _ctx: ExecutionContextLike): Promise<void> {
    await createService(env, new Request("https://worker.invalid/healthz")).cleanup();
  },
};
