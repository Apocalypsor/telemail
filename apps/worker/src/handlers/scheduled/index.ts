import type { ScheduledTaskContext } from "@worker/handlers/scheduled/base";
import { DailyMailSummaryTask } from "@worker/handlers/scheduled/tasks/daily-summary";
import { DueRemindersTask } from "@worker/handlers/scheduled/tasks/reminders";
import { RenewPushTask } from "@worker/handlers/scheduled/tasks/renew-push";
import { RetryFailedEmailsTask } from "@worker/handlers/scheduled/tasks/retry-failed-emails";
import type { Env } from "@worker/types";

const SCHEDULED_TASKS = [
  new DueRemindersTask(),
  new DailyMailSummaryTask(),
  new RetryFailedEmailsTask(),
  new RenewPushTask(),
];

const scheduledHandler = async (
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> => {
  const taskContext: ScheduledTaskContext = {
    env,
    date: new Date(event.scheduledTime),
    waitUntil: ctx.waitUntil.bind(ctx),
  };
  await Promise.allSettled(
    SCHEDULED_TASKS.map((task) => task.runIfDue(taskContext)),
  );
};

export default scheduledHandler;
