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

export function createPayTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_pay",
    label: "AIOT Pay Purchase",
    description:
      "Execute a purchase using a single-use virtual card. Automatically creates a card, tops it up with the exact amount, and retrieves full card details. Requires transaction PIN.",
    parameters: Type.Object({
      amount: Type.Number({ description: "Purchase amount" }),
      pin: Type.String({ description: "Your transaction PIN (4 digits)" }),
      currency: Type.Optional(Type.String({ description: "Currency code (default: USD)" })),
      merchant: Type.Optional(Type.String({ description: "Merchant name (for record keeping)" })),
      description: Type.Optional(Type.String({ description: "Purchase description" })),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const amount = params.amount as number;
      const pin = params.pin as string;
      const currency = params.currency as string | undefined;
      const merchant = params.merchant as string | undefined;
      const description = params.description as string | undefined;

      if (!amount || amount <= 0) {
        return {
          content: [{ type: "text", text: "Invalid amount. Must be greater than 0." }],
        };
      }

      if (!pin || !/^\d{4,6}$/.test(pin)) {
        return {
          content: [{ type: "text", text: "Invalid PIN format. PIN must be 4-6 digits." }],
        };
      }

      let cardId: string | null = null;

      try {
        // Step 1: Verify KYC
        const kycStatus = await withAuth(ctx, config, client, tokenService, (token) =>
          client.getKycStatus(token),
        );

        if (kycStatus.status !== "approved") {
          return {
            content: [
              {
                type: "text",
                text: `KYC must be approved before making purchases. Current status: ${kycStatus.status}. Use aiot_pay_kyc_check to see what's needed.`,
              },
            ],
            details: { kycStatus: kycStatus.status },
          };
        }

        // Step 2: Create single-use card
        const card = await withAuth(ctx, config, client, tokenService, (token) =>
          client.createSingleUseCard(token),
        );
        cardId = card.uuid;

        // Step 3: Top up with exact amount
        await withAuth(ctx, config, client, tokenService, (token) =>
          client.topUpCard(token, card.uuid, amount, currency),
        );

        // Step 4: Get full card details
        const details = await withAuth(ctx, config, client, tokenService, (token) =>
          client.getCardDetails(token, card.uuid, pin),
        );

        // Step 5: Save card details to file
        const cardsDir = path.join(os.homedir(), ".openclaw", "aiot-pay", "cards");
        fs.mkdirSync(cardsDir, { recursive: true });
        const filePath = path.join(cardsDir, `${card.uuid}.json`);

        fs.writeFileSync(
          filePath,
          JSON.stringify(
            {
              card_id: card.uuid,
              card_number: details.card_number,
              cvv: details.cvv,
              expiry: details.expiry,
              holder_name: details.holder_name,
              amount,
              currency: currency || "USD",
              merchant: merchant || null,
              description: description || null,
              created_at: new Date().toISOString(),
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
              text: [
                "Single-use card ready for payment!",
                `Card: ****${last4}`,
                `Expiry: ${details.expiry}`,
                `Funded: ${amount}${currency ? ` ${currency}` : ""}`,
                merchant ? `Merchant: ${merchant}` : null,
                `Details saved to: ${filePath}`,
                "",
                "Open the file to see the full card number and CVV for checkout.",
                "This card will auto-dispose after one transaction.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          details: {
            cardId: card.uuid,
            maskedPan: `****${last4}`,
            expiry: details.expiry,
            filePath,
            amount,
            currency: currency || "USD",
            merchant: merchant || null,
            status: "ready_to_pay",
          },
        };
      } catch (err) {
        // Rollback: cancel the card if it was created but subsequent steps failed
        if (cardId) {
          try {
            await withAuth(ctx, config, client, tokenService, (token) =>
              client.cancelCard(token, cardId!, pin),
            );
          } catch {
            // Best-effort rollback
          }
        }

        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
