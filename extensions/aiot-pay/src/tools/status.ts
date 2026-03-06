import { Type } from "@sinclair/typebox";
import type { AiotPayClient } from "../api-client.js";
import type { TokenService } from "../token-service.js";
import type { AiotPayConfig, ToolResult } from "../types.js";
import { resolveAuth } from "../auth.js";
import { AiotPayError, formatError } from "../errors.js";

type ToolContext = {
  messageChannel?: string;
  agentAccountId?: string;
  sessionKey?: string;
};

export function createStatusTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_status",
    label: "AIOT Pay Status",
    description:
      "Check your AIOT Pay account status: authentication, KYC status, balance, and wallet overview.",
    parameters: Type.Object({}),
    async execute(): Promise<ToolResult> {
      const auth = resolveAuth(ctx, tokenService);
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated. Use aiot_pay_login to sign in with your AIOT email and password.",
            },
          ],
          details: { authenticated: false },
        };
      }

      try {
        const [kycStatus, wallets, balance] = await Promise.allSettled([
          client.getKycStatus(auth.accessToken),
          client.listWallets(auth.accessToken),
          client.getBalance(auth.accessToken),
        ]);

        const kyc = kycStatus.status === "fulfilled" ? kycStatus.value : null;
        const walletList = wallets.status === "fulfilled" ? wallets.value : null;
        const bal = balance.status === "fulfilled" ? balance.value : null;

        const lines: string[] = ["Account overview:"];
        lines.push(`- Authenticated: Yes (via ${auth.source})`);
        lines.push(`- User ID: ${auth.userId}`);

        if (kyc) {
          lines.push(`- KYC status: ${kyc.status}`);
          if (kyc.reason) lines.push(`  Reason: ${kyc.reason}`);
        } else {
          lines.push("- KYC status: unable to fetch");
        }

        if (bal) {
          lines.push(`- Balance: ${bal.balance} ${bal.currency}`);
          lines.push(`- Available: ${bal.available_balance} ${bal.currency}`);
        }

        if (walletList && walletList.length > 0) {
          lines.push(`- Wallets: ${walletList.length}`);
          for (const w of walletList) {
            lines.push(
              `  - ${w.name} (${w.currency}): ${w.available_balance} available, status: ${w.status}`,
            );
          }
        } else if (walletList) {
          lines.push("- Wallets: none (KYC approval creates wallets automatically)");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            authenticated: true,
            source: auth.source,
            userId: auth.userId,
            kycStatus: kyc?.status ?? "unknown",
            balance: bal ?? null,
            walletCount: walletList?.length ?? 0,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
