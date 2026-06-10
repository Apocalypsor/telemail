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
} from "@worker/clients/things-cloud/utils";

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

    return {
      id: historyKey,
      latestServerIndex: items["current-item-index"] ?? 0,
    };
  }

  async createTodo(input: ThingsTodoInput): Promise<string> {
    const history = await this.ownSyncedHistory();
    const id = input.id ?? generateThingsUuid();
    const envelope: WriteEnvelope = {
      t: 0,
      e: "Task6",
      p: createTaskPayload(input),
    };
    const body: Record<string, WriteEnvelope> = { [id]: envelope };
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
        },
      )
      .json<CommitResponse>();
    if (typeof response["server-head-index"] !== "number") {
      throw new Error("Things Cloud commit response has no server head index");
    }
    return id;
  }
}
