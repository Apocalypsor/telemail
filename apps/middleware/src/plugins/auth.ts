import { config } from "@middleware/config";
import { Elysia } from "elysia";

export const auth = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  ({ headers, status }) => {
    const header = headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token !== config.bridgeSecret) {
      return status(401, { error: "Unauthorized" });
    }
    return {};
  },
);
