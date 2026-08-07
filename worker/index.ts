import { Hono } from "hono";
import { accessAuth, type AccessIdentity } from "./auth/access-jwt.ts";
import { exposureRoutes } from "./modules/workers-access-exposure/routes.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
}

const app = new Hono<{ Bindings: Env; Variables: { identity: AccessIdentity } }>();

// Every /api/* route is gated by Access JWT validation (constitution
// Principle II) before it reaches any module's router.
app.use("/api/*", accessAuth);
app.route("/api/exposure", exposureRoutes);

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },

  scheduled(controller: ScheduledController, _env: Env, _ctx: ExecutionContext): void {
    // Real drift-audit logic (shared with POST /api/exposure/evaluate,
    // constitution Principle III) wired in T030.
    console.log(`scheduled run: ${controller.cron}`);
  },
} satisfies ExportedHandler<Env>;
