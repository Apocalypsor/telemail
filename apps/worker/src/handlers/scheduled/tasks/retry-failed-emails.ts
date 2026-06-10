import {
  ScheduledTask,
  type ScheduledTaskContext,
} from "@worker/handlers/scheduled/base";
import { retryAllFailedEmails } from "@worker/utils/mail-delivery/retry";

export class RetryFailedEmailsTask extends ScheduledTask {
  constructor() {
    super("scheduled.retry_failed_emails");
  }

  protected shouldRun(ctx: ScheduledTaskContext): boolean {
    return this.isHourly(ctx);
  }

  protected async run({ env }: ScheduledTaskContext): Promise<void> {
    await retryAllFailedEmails(env);
  }
}
