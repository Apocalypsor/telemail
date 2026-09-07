import { http } from "@worker/clients/http";
import {
  APP_ID,
  DEFAULT_ENDPOINT,
  THINGS_SCHEMA,
} from "@worker/clients/things-cloud/constants";
import type {
  CommitResponse,
  ItemsResponse,
  SyncedHistory,
  ThingsCloudConfig,
  ThingsTodoInput,
  VerifyResponse,
  WriteEnvelope,
} from "@worker/clients/things-cloud/types";
import {
  commonHeaders,
  createTaskPayload,
  endpointUrl,
  generateThingsUuid,
  validateThingsUuid,
} from "@worker/clients/things-cloud/utils";
import { HTTPError } from "ky";

export class ThingsCloudClient {
  private readonly endpoint: string;
  private readonly email: string;
  private readonly password: string;
  private readonly appInstanceId: string;

  constructor(config: ThingsCloudConfig) {
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.email = config.email;
    this.password = config.password;
    this.appInstanceId = config.appInstanceId;
  }

  async verify(): Promise<VerifyResponse> {
    return await http
      .get(
        endpointUrl(
          this.endpoint,
          `/version/1/account/${encodeURIComponent(this.email)}`,
        ),
        {
          headers: {
            ...commonHeaders(),
            Authorization: `Password ${this.password}`,
          },
        },
      )
      .json<VerifyResponse>();
  }

  async ownSyncedHistory(): Promise<SyncedHistory> {
    const account = await this.verify();
    const historyKey = account["history-key"];
    if (!historyKey)
      throw new Error("Things Cloud response has no history key");

    const items = await http
      .get(
        endpointUrl(this.endpoint, `/version/1/history/${historyKey}/items`),
        {
          headers: commonHeaders(),
          searchParams: { "start-index": "0" },
        },
      )
      .json<ItemsResponse>();

    const head = items["current-item-index"];
    if (typeof head !== "number" || !Number.isSafeInteger(head) || head < 0) {
      throw new Error("Things Cloud response has no valid history head index");
    }
    return { id: historyKey, latestServerIndex: head };
  }

  async createTodo(input: ThingsTodoInput): Promise<string> {
    const [id] = await this.createTodos([input]);
    return id;
  }

  async createTodos(inputs: ThingsTodoInput[]): Promise<string[]> {
    if (inputs.length === 0) return [];
    const body: Record<string, WriteEnvelope> = {};
    const ids = inputs.map((input) => {
      const id = input.id ?? generateThingsUuid();
      validateThingsUuid(id);
      if (Object.hasOwn(body, id)) {
        throw new Error("Things Cloud commit contains duplicate task IDs");
      }
      // Timed alarms are outside the upstream verified Task7 create scope.
      body[id] = {
        t: 0,
        e: input.when ? "Task6" : "Task7",
        p: createTaskPayload(input),
      };
      return id;
    });
    for (let attempt = 0; ; attempt++) {
      const history = await this.ownSyncedHistory();
      try {
        await this.commit(history, body);
        return ids;
      } catch (error) {
        // A 409 rejects this commit. Refresh the ancestor and retry the same
        // IDs/payload; never replay an ambiguous network or server failure.
        if (
          !(error instanceof HTTPError) ||
          error.response.status !== 409 ||
          attempt >= 2
        ) {
          throw error;
        }
      }
    }
  }

  private async commit(
    history: SyncedHistory,
    body: Record<string, WriteEnvelope>,
  ): Promise<void> {
    const response = await http
      .post(
        endpointUrl(this.endpoint, `/version/1/history/${history.id}/commit`),
        {
          headers: {
            ...commonHeaders(),
            "Content-Type": "application/json; charset=UTF-8",
            "Content-Encoding": "UTF-8",
            Schema: THINGS_SCHEMA,
            "Push-Priority": "5",
            "App-Instance-Id": this.appInstanceId,
            "App-Id": APP_ID,
          },
          searchParams: {
            "ancestor-index": String(history.latestServerIndex),
            _cnt: "1",
          },
          json: body,
          retry: 0,
        },
      )
      .json<CommitResponse>();
    const head = response["server-head-index"];
    if (
      typeof head !== "number" ||
      !Number.isSafeInteger(head) ||
      head <= history.latestServerIndex
    ) {
      throw new Error("Things Cloud commit response has no server head index");
    }
  }
}
