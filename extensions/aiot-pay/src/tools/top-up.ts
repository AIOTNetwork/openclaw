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

export function createTopUpTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_top_up",
    label: "AIOT Pay Top Up",
    description:
      "Top up a card wallet with a specific amount, or get crypto deposit instructions for manual funding.",
    parameters: Type.Object({
      card_id: Type.Optional(
        Type.String({ description: "Card UUID to top up (for direct top-up)" }),
      ),
      amount: Type.Optional(Type.Number({ description: "Amount to top up (for direct top-up)" })),
      currency: Type.Optional(Type.String({ description: "Currency code (default: USD)" })),
      mode: Type.Optional(
        Type.Unsafe<"direct" | "crypto">({
          type: "string",
          enum: ["direct", "crypto"],
          description: 'Top-up mode: "direct" (default) or "crypto" for deposit address',
        }),
      ),
      coin_id: Type.Optional(
        Type.String({ description: "Coin ID for crypto deposit (e.g. USDC)" }),
      ),
      network_id: Type.Optional(
        Type.String({ description: "Network ID for crypto deposit (e.g. solana)" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const mode = (params.mode as string) || "direct";

      try {
        if (mode === "crypto") {
          return handleCryptoTopUp(params, ctx, config, client, tokenService);
        }

        const cardId = params.card_id as string;
        const amount = params.amount as number;

        if (!cardId || !amount || amount <= 0) {
          return {
            content: [
              { type: "text", text: "Missing card_id or invalid amount for direct top-up." },
            ],
          };
        }

        const currency = (params.currency as string) || undefined;

        const result = await withAuth(ctx, config, client, tokenService, (token) =>
          client.topUpCard(token, cardId, amount, currency),
        );

        return {
          content: [
            {
              type: "text",
              text: `Card topped up successfully!\nTransaction ID: ${result.transaction_id}\nNew balance: ${result.new_balance}\nStatus: ${result.status}`,
            },
          ],
          details: {
            transaction_id: result.transaction_id,
            new_balance: result.new_balance,
            status: result.status,
            cardId,
            amount,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}

async function handleCryptoTopUp(
  params: Record<string, unknown>,
  ctx: ToolContext,
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
): Promise<ToolResult> {
  const coinId = params.coin_id as string | undefined;
  const networkId = params.network_id as string | undefined;

  if (!coinId) {
    const coins = await withAuth(ctx, config, client, tokenService, (token) =>
      client.getCoins(token),
    );

    if (coins.length === 0) {
      return {
        content: [{ type: "text", text: "No supported cryptocurrencies available for deposit." }],
      };
    }

    const lines = ["Available cryptocurrencies for deposit:"];
    for (const coin of coins) {
      lines.push(`- ${coin.name} (${coin.symbol}) — ID: ${coin.coin_id}`);
    }
    lines.push('\nCall aiot_pay_top_up with mode: "crypto" and coin_id to see available networks.');

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { coins: coins.map((c) => ({ id: c.coin_id, name: c.name, symbol: c.symbol })) },
    };
  }

  if (!networkId) {
    const networks = await withAuth(ctx, config, client, tokenService, (token) =>
      client.getCoinNetworks(token, coinId),
    );

    if (networks.length === 0) {
      return {
        content: [{ type: "text", text: `No networks available for ${coinId}.` }],
      };
    }

    const lines = [`Available networks for ${coinId}:`];
    for (const net of networks) {
      lines.push(`- ${net.name} — ID: ${net.network_id}`);
    }
    lines.push(
      '\nCall aiot_pay_top_up with mode: "crypto", coin_id, and network_id to get the deposit address.',
    );

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { coinId, networks },
    };
  }

  const deposit = await withAuth(ctx, config, client, tokenService, (token) =>
    client.getDepositAddress(token, coinId, networkId),
  );

  const lines = [
    `Deposit address for ${deposit.coin} on ${deposit.network}:`,
    `Address: ${deposit.address}`,
  ];
  if (deposit.memo) {
    lines.push(`Memo/Tag: ${deposit.memo} (REQUIRED — include this or funds may be lost)`);
  }
  lines.push(
    "\nSend crypto to this address. Funds will appear in your wallet after blockchain confirmation.",
  );

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: {
      address: deposit.address,
      network: deposit.network,
      coin: deposit.coin,
      memo: deposit.memo,
    },
  };
}
