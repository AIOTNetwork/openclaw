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

export function createCardTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_create_card",
    label: "AIOT Pay Create Card",
    description:
      "Apply for a virtual card. Single-use cards are for one-time purchases. Multi-use cards persist for repeated use. KYC must be approved first.",
    parameters: Type.Object({
      type: Type.Unsafe<"single-use" | "multi-use">({
        type: "string",
        enum: ["single-use", "multi-use"],
        description: "Card type: single-use (one transaction) or multi-use (reusable)",
      }),
      wallet_uuid: Type.Optional(
        Type.String({ description: "Specific wallet UUID (uses default wallet if omitted)" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const cardType = params.type as string;
      const walletUuid = params.wallet_uuid as string | undefined;

      if (!cardType || (cardType !== "single-use" && cardType !== "multi-use")) {
        return {
          content: [
            { type: "text", text: 'Please specify card type: "single-use" or "multi-use".' },
          ],
        };
      }

      try {
        const kycStatus = await withAuth(ctx, config, client, tokenService, (token) =>
          client.getKycStatus(token),
        );

        if (kycStatus.status !== "approved") {
          return {
            content: [
              {
                type: "text",
                text: `KYC must be approved before creating a card. Current status: ${kycStatus.status}. Use aiot_pay_kyc_check to see what's needed.`,
              },
            ],
            details: { kycStatus: kycStatus.status },
          };
        }

        const card = await withAuth(ctx, config, client, tokenService, (token) =>
          cardType === "multi-use"
            ? client.createMultiUseCard(token, walletUuid)
            : client.createSingleUseCard(token, walletUuid),
        );

        return {
          content: [
            {
              type: "text",
              text: [
                `${cardType === "multi-use" ? "Multi-use" : "Single-use"} virtual card created!`,
                `Card ID: ${card.uuid}`,
                `Last 4: ${card.last_4}`,
                `Holder: ${card.holder_name}`,
                `Expiry: ${card.expiry}`,
                `Status: ${card.status}`,
                `Card PIN (for ATM/POS): ${card.pin}`,
                "",
                "To get the full card number and CVV, use aiot_pay_card_details with your transaction PIN.",
              ].join("\n"),
            },
          ],
          details: {
            uuid: card.uuid,
            type: cardType,
            maskedPan: card.number,
            last4: card.last_4,
            holderName: card.holder_name,
            expiry: card.expiry,
            status: card.status,
            cardPin: card.pin,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
