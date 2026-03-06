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

export function createListCardsTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_list_cards",
    label: "AIOT Pay List Cards",
    description: "List all your virtual cards with their status, balance, and expiry.",
    parameters: Type.Object({
      wallet_uuid: Type.Optional(
        Type.String({ description: "Filter by wallet UUID (lists all wallets' cards if omitted)" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const walletUuid = params.wallet_uuid as string | undefined;

      try {
        const cards = await withAuth(ctx, config, client, tokenService, (token) =>
          client.listCards(token, walletUuid),
        );

        if (cards.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No cards found. Use aiot_pay_create_card to create a virtual card.",
              },
            ],
            details: { count: 0 },
          };
        }

        const lines = [`Found ${cards.length} card(s):\n`];
        for (const card of cards) {
          lines.push(`- ${card.type} card ****${card.last_4}`);
          lines.push(`  UUID: ${card.uuid}`);
          lines.push(`  Holder: ${card.holder_name}`);
          lines.push(`  Expiry: ${card.expiry}`);
          lines.push(`  Balance: ${card.amount}`);
          lines.push(`  Status: ${card.status}`);
          lines.push("");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            count: cards.length,
            cards: cards.map((c) => ({
              uuid: c.uuid,
              last4: c.last_4,
              type: c.type,
              status: c.status,
              amount: c.amount,
            })),
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
