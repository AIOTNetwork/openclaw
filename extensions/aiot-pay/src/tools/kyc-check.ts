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

export function createKycCheckTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_kyc_check",
    label: "AIOT Pay KYC Check",
    description:
      "Check your KYC (Know Your Customer) verification status and see what documents are needed.",
    parameters: Type.Object({}),
    async execute(): Promise<ToolResult> {
      try {
        const [kycStatus, metadata] = await Promise.all([
          withAuth(ctx, config, client, tokenService, (token) => client.getKycStatus(token)),
          withAuth(ctx, config, client, tokenService, (token) => client.getKycMetadata(token)),
        ]);

        const lines: string[] = [`KYC Status: ${kycStatus.status}`];

        if (kycStatus.reason) {
          lines.push(`Reason: ${kycStatus.reason}`);
        }
        if (kycStatus.submitted_at) {
          lines.push(`Submitted: ${kycStatus.submitted_at}`);
        }

        const docEntries = Object.entries(kycStatus.documents);
        if (docEntries.length > 0) {
          lines.push("\nDocument checklist:");
          for (const [doc, status] of docEntries) {
            const icon = status === "approved" ? "✓" : status === "uploaded" ? "⏳" : "✗";
            lines.push(`  ${icon} ${doc}: ${status}`);
          }
        }

        if (kycStatus.status === "pending") {
          lines.push("\nNext step: Submit your KYC profile data using aiot_pay_kyc_submit.");
        } else if (kycStatus.status === "submitted" || kycStatus.status === "in_review") {
          lines.push("\nYour KYC is being reviewed. Check back later.");
        } else if (kycStatus.status === "rejected") {
          lines.push("\nYour KYC was rejected. Please review the reason and resubmit.");
        } else if (kycStatus.status === "approved") {
          lines.push("\nKYC approved! You can now create virtual cards.");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            status: kycStatus.status,
            documents: kycStatus.documents,
            documentTypes: metadata.document_types.map((d) => d.value),
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
