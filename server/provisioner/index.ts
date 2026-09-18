import { createProvisioningService } from "./env.ts";
import { routeProvisioningRequest } from "./routes.ts";
import type { ProvisioningEnv } from "./env.ts";

interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void; }

export default {
  async fetch(request: Request, env: ProvisioningEnv, ctx: ExecutionContextLike): Promise<Response> {
    return routeProvisioningRequest(request, createProvisioningService(env), ctx);
  },
  async scheduled(_controller: unknown, env: ProvisioningEnv, _ctx: ExecutionContextLike): Promise<void> {
    await createProvisioningService(env).cleanupExpired();
  },
};
