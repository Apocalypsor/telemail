import {
  ScheduledTask,
  type ScheduledTaskContext,
} from "@worker/handlers/scheduled/base";
import { renewAllPush } from "@worker/providers";

export class RenewPushTask extends ScheduledTask {
  constructor() {
    super("scheduled.push_renew_failed");
  }

  protected shouldRun(ctx: ScheduledTaskContext): boolean {
    return this.isUtcMidnight(ctx);
  }

  protected async run({ env }: ScheduledTaskContext): Promise<void> {
    await renewAllPush(env);
  }
}
