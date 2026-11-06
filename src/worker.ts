import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { runScheduled } from "./lib/pipeline/cron";

const fetch = createStartHandler(defaultStreamHandler);

export default {
  fetch,
  async scheduled(controller: ScheduledController, _env: CloudflareEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(controller.cron));
  },
};
