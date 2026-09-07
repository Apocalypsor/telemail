import { env } from "cloudflare:workers";
import { RemindersService } from "@worker/api/modules/reminders/service";
import { ThingsCloudClient } from "@worker/clients/things-cloud";
import * as kv from "@worker/db/kv";
import { getReminderById, listDueReminders } from "@worker/db/reminders";
import type { Env } from "@worker/types";
import * as observability from "@worker/utils/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testEnv: Env = {
  ...env,
  ADMIN_SECRET: "test-secret",
  ADMIN_TELEGRAM_ID: "test-user",
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_WEBHOOK_SECRET: "test-webhook",
  GMAIL_CLIENT_ID: "test-client",
  GMAIL_CLIENT_SECRET: "test-client-secret",
  GMAIL_PUBSUB_TOPIC: "test-topic",
  GMAIL_PUSH_SECRET: "test-push",
  WORKER_URL: "https://telemail.test",
};

beforeEach(async () => {
  vi.spyOn(kv, "getThingsAppInstanceId").mockResolvedValue("test-instance");
  vi.spyOn(observability, "reportErrorToObservability").mockResolvedValue();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reminders"),
    env.DB.prepare(
      "INSERT OR REPLACE INTO accounts (id, chat_id, email) VALUES (901, 'things-user', 'mail@example.com')",
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO users (telegram_id, first_name, things_cloud_email, things_cloud_password, user_timezone) VALUES ('things-user', 'Test', 'things@example.com', 'password', 'America/New_York'), ('other-user', 'Other', 'other@example.com', 'password', 'UTC')",
    ),
    env.DB.prepare(
      "INSERT INTO reminders (id, telegram_user_id, text, remind_at, account_id, email_message_id, things_task_id) VALUES (901, 'things-user', 'First', 1, 901, 'mail-1', NULL), (902, 'things-user', 'Second', 1, 901, 'mail-2', NULL), (903, 'things-user', 'Already synced', 1, 901, 'mail-3', 'existing-id'), (904, 'things-user', 'Generic', 1, NULL, NULL, NULL), (905, 'other-user', 'Other user', 1, 901, 'mail-5', NULL)",
    ),
  ]);
});

afterEach(() => vi.restoreAllMocks());

describe("Things reminder batching", () => {
  it("sends one batch per user and persists every task ID only after success", async () => {
    const create = vi
      .spyOn(ThingsCloudClient.prototype, "createTodos")
      .mockImplementation(async (inputs) => {
        if (inputs.length === 2) {
          expect(
            (await getReminderById(env.DB, 901))?.things_task_id,
          ).toBeNull();
          expect(
            (await getReminderById(env.DB, 902))?.things_task_id,
          ).toBeNull();
        }
        return inputs.map(({ id }) => {
          if (!id) throw new Error("Missing deterministic ID");
          return id;
        });
      });
    const reminders = await listDueReminders(env.DB, new Date());
    await RemindersService.pushThingsTasksForDueEmailReminders(
      testEnv,
      reminders,
    );
    expect(create).toHaveBeenCalledTimes(2);
    const batch = create.mock.calls.find(
      ([inputs]) => inputs.length === 2,
    )?.[0];
    expect(batch).toMatchObject([
      { title: "First", today: true, timeZone: "America/New_York" },
      { title: "Second", today: true, timeZone: "America/New_York" },
    ]);
    expect((await getReminderById(env.DB, 901))?.things_task_id).toBe(
      batch?.[0].id,
    );
    expect((await getReminderById(env.DB, 902))?.things_task_id).toBe(
      batch?.[1].id,
    );
    expect((await getReminderById(env.DB, 903))?.things_task_id).toBe(
      "existing-id",
    );
    expect((await getReminderById(env.DB, 904))?.things_task_id).toBeNull();
    create.mockClear();
    await RemindersService.pushThingsTasksForDueEmailReminders(
      testEnv,
      reminders,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps failed batches unconfirmed while another user still succeeds", async () => {
    vi.spyOn(ThingsCloudClient.prototype, "createTodos").mockImplementation(
      async (inputs) => {
        if (inputs.length === 2) throw new Error("Things commit failed");
        return ["other-task-id"];
      },
    );
    await RemindersService.pushThingsTasksForDueEmailReminders(
      testEnv,
      await listDueReminders(env.DB, new Date()),
    );
    expect((await getReminderById(env.DB, 901))?.things_task_id).toBeNull();
    expect((await getReminderById(env.DB, 902))?.things_task_id).toBeNull();
    expect((await getReminderById(env.DB, 905))?.things_task_id).toBe(
      "other-task-id",
    );
    expect(observability.reportErrorToObservability).toHaveBeenCalledOnce();
  });
});
