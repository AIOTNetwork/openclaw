import { Type } from "@sinclair/typebox";
import type { ToolResult } from "../types.js";

export function createLinkAccountTool() {
  return {
    name: "aiot_pay_link_account",
    label: "AIOT Pay Link Account",
    description:
      "Link your AIOT account to this channel via browser consent URL. (Not yet available — use aiot_pay_login instead.)",
    parameters: Type.Object({
      action: Type.Optional(
        Type.Unsafe<"initiate" | "check_status">({
          type: "string",
          enum: ["initiate", "check_status"],
          description: 'Action to perform. "initiate" to start linking, "check_status" to poll.',
        }),
      ),
    }),
    async execute(): Promise<ToolResult> {
      return {
        content: [
          {
            type: "text",
            text: "Account linking via browser consent URL is not yet available. Please use aiot_pay_login to authenticate with your AIOT email and password instead.",
          },
        ],
        details: { available: false, alternative: "aiot_pay_login" },
      };
    },
  };
}
