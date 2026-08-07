import { Hono } from "hono";
import { accessAuth, type AccessIdentity } from "./auth/access-jwt.ts";
import { exposureRoutes, runEvaluation } from "./modules/workers-access-exposure/routes.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
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

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    // Calls the exact same shared evaluation module POST /api/exposure/
    // evaluate does (constitution Principle III) — no divergent logic
    // between the interactive and scheduled entry points.
    ctx.waitUntil(
      runEvaluation(env, "scheduled").then(({ runId, newAlertCount }) => {
        console.log(
          `scheduled run ${runId} (cron ${controller.cron}): ${newAlertCount} new alert(s)`,
        );
      }).catch((err: unknown) => {
        console.error(`scheduled run failed: ${err instanceof Error ? err.message : String(err)}`);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
