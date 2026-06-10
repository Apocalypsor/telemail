import {
  ScheduledTask,
  type ScheduledTaskContext,
} from "@worker/handlers/scheduled/base";
import { checkImapBridgeHealth } from "@worker/providers/imap/utils/client";
import { reportErrorToObservability } from "@worker/utils/observability";

export class ImapBridgeHealthTask extends ScheduledTask {
  constructor() {
    super("scheduled.imap_bridge_health_check_failed");
  }

  protected shouldRun(ctx: ScheduledTaskContext): boolean {
    return ctx.date.getUTCMinutes() % 5 === 0;
  }

  protected async run({ env }: ScheduledTaskContext): Promise<void> {
    const health = await checkImapBridgeHealth(env);
    if (health === null || health.ok) return;
    await reportErrorToObservability(
      env,
      "scheduled.imap_bridge_unhealthy",
      new Error("IMAP bridge unhealthy"),
      {
        total: health.total,
        usable: health.usable,
      },
    );
  }
}
