import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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

export function createCardDetailsTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_card_details",
    label: "AIOT Pay Card Details",
    description:
      "Get the full card number and CVV for a virtual card. Requires your transaction PIN. Details are saved to a local file for security.",
    parameters: Type.Object({
      card_id: Type.String({ description: "Card UUID" }),
      pin: Type.String({ description: "Your transaction PIN (4 digits)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const cardId = params.card_id as string;
      const pin = params.pin as string;

      if (!cardId || !pin) {
        return {
          content: [{ type: "text", text: "Missing card_id or pin." }],
        };
      }

      if (!/^\d{4,6}$/.test(pin)) {
        return {
          content: [{ type: "text", text: "Invalid PIN format. PIN must be 4-6 digits." }],
        };
      }

      try {
        const details = await withAuth(ctx, config, client, tokenService, (token) =>
          client.getCardDetails(token, cardId, pin),
        );

        const cardsDir = path.join(os.homedir(), ".openclaw", "aiot-pay", "cards");
        fs.mkdirSync(cardsDir, { recursive: true });
        const filePath = path.join(cardsDir, `${cardId}.json`);

        fs.writeFileSync(
          filePath,
          JSON.stringify(
            {
              card_id: cardId,
              card_number: details.card_number,
              cvv: details.cvv,
              expiry: details.expiry,
              holder_name: details.holder_name,
              retrieved_at: new Date().toISOString(),
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );

        const last4 = details.card_number.slice(-4);
        return {
          content: [
            {
              type: "text",
              text: `Card details retrieved and saved securely.\nCard: ****${last4}\nExpiry: ${details.expiry}\nFile: ${filePath}\n\nOpen the file to see the full card number and CVV. Do NOT share these details in chat.`,
            },
          ],
          details: {
            cardId,
            maskedPan: `****${last4}`,
            expiry: details.expiry,
            filePath,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
