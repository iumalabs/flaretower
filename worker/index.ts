import { Hono } from "hono";
import { accessAuth, type AccessIdentity } from "./auth/access-jwt.ts";
import { exposureRoutes, runEvaluation } from "./modules/workers-access-exposure/routes.ts";
import { dnsRoutes, runDnsEvaluation } from "./modules/dns/routes.ts";
import { runZeroTrustEvaluation, zeroTrustRoutes } from "./modules/zero-trust/routes.ts";
import { pagesRoutes, runPagesEvaluation } from "./modules/pages/routes.ts";
import { storageRoutes } from "./modules/storage/routes.ts";

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
app.route("/api/dns", dnsRoutes);
app.route("/api/zero-trust", zeroTrustRoutes);
app.route("/api/pages", pagesRoutes);
app.route("/api/storage", storageRoutes);

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    // One shared Cron Trigger entry point drives every module's scheduled
    // audit (constitution Principle III) — each module calls the exact
    // same evaluation function its own interactive POST /evaluate route
    // does. Each module's evaluation is awaited independently (separate
    // waitUntil + catch) so a failure in one module's Cloudflare API calls
    // doesn't prevent another module's scheduled audit from running.
    ctx.waitUntil(
      runEvaluation(env, "scheduled").then(({ runId, newAlertCount }) => {
        console.log(
          `exposure scheduled run ${runId} (cron ${controller.cron}): ${newAlertCount} new alert(s)`,
        );
      }).catch((err: unknown) => {
        console.error(
          `exposure scheduled run failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    );

    ctx.waitUntil(
      runDnsEvaluation(env, "scheduled").then(({ runId, newAlertCount }) => {
        console.log(
          `dns scheduled run ${runId} (cron ${controller.cron}): ${newAlertCount} new alert(s)`,
        );
      }).catch((err: unknown) => {
        console.error(
          `dns scheduled run failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    );

    ctx.waitUntil(
      runZeroTrustEvaluation(env, "scheduled").then(({ runId, newAlertCount }) => {
        console.log(
          `zero-trust scheduled run ${runId} (cron ${controller.cron}): ${newAlertCount} new alert(s)`,
        );
      }).catch((err: unknown) => {
        console.error(
          `zero-trust scheduled run failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    );

    ctx.waitUntil(
      runPagesEvaluation(env, "scheduled").then(({ runId, newAlertCount }) => {
        console.log(
          `pages scheduled run ${runId} (cron ${controller.cron}): ${newAlertCount} new alert(s)`,
        );
      }).catch((err: unknown) => {
        console.error(
          `pages scheduled run failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    );
  },
} satisfies ExportedHandler<Env>;
