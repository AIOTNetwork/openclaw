import { Type } from "@sinclair/typebox";
import type { AiotPayClient } from "../api-client.js";
import type { TokenService } from "../token-service.js";
import type { AiotPayConfig, ToolResult } from "../types.js";
import { withAuth } from "../auth.js";
import { AiotPayError, formatError } from "../errors.js";

type ToolContext = {
  messageChannel?: string;
  agentAccountId?: string;
  sessionKey?: string;
};

export function createManageCardTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_manage_card",
    label: "AIOT Pay Manage Card",
    description: "Lock, unlock, or cancel a virtual card. Requires your transaction PIN.",
    parameters: Type.Object({
      card_id: Type.String({ description: "Card UUID" }),
      pin: Type.String({ description: "Your transaction PIN (4 digits)" }),
      action: Type.Unsafe<"lock" | "unlock" | "cancel">({
        type: "string",
        enum: ["lock", "unlock", "cancel"],
        description: "Action: lock, unlock, or cancel the card",
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const cardId = params.card_id as string;
      const pin = params.pin as string;
      const action = params.action as string;

      if (!cardId || !pin || !action) {
        return {
          content: [{ type: "text", text: "Missing card_id, pin, or action." }],
        };
      }

      if (!/^\d{4,6}$/.test(pin)) {
        return {
          content: [{ type: "text", text: "Invalid PIN format. PIN must be 4-6 digits." }],
        };
      }

      if (!["lock", "unlock", "cancel"].includes(action)) {
        return {
          content: [
            { type: "text", text: 'Invalid action. Must be "lock", "unlock", or "cancel".' },
          ],
        };
      }

      try {
        const result = await withAuth(ctx, config, client, tokenService, (token) => {
          switch (action) {
            case "lock":
              return client.lockCard(token, cardId, pin);
            case "unlock":
              return client.unlockCard(token, cardId, pin);
            case "cancel":
              return client.cancelCard(token, cardId, pin);
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        });

        const actionPast =
          action === "lock" ? "locked" : action === "unlock" ? "unlocked" : "cancelled";

        return {
          content: [
            {
              type: "text",
              text: `Card ${actionPast} successfully. Status: ${result.status}`,
            },
          ],
          details: {
            cardId,
            action,
            status: result.status,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
