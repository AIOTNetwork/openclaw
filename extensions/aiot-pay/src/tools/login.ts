import { Type } from "@sinclair/typebox";
import type { AiotPayClient } from "../api-client.js";
import type { TokenService } from "../token-service.js";
import type { AiotPayConfig, ToolResult } from "../types.js";
import { AiotPayError, formatError } from "../errors.js";

type ToolContext = {
  messageChannel?: string;
  agentAccountId?: string;
  sessionKey?: string;
};

export function createLoginTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  const channelType = ctx.messageChannel ?? "unknown";
  const channelUserId = ctx.agentAccountId ?? ctx.sessionKey ?? "";

  return {
    name: "aiot_pay_login",
    label: "AIOT Pay Login",
    description:
      "Authenticate with AIOT Pay using email + password (for third-party channels like Discord/Telegram). Supports login for existing users and multi-step signup for new users.",
    parameters: Type.Object({
      action: Type.Optional(
        Type.Unsafe<"login" | "send_otp" | "verify_otp" | "signup">({
          type: "string",
          enum: ["login", "send_otp", "verify_otp", "signup"],
          description:
            'Action to perform. Default: "login". Use "send_otp" → "verify_otp" → "signup" for new user registration.',
        }),
      ),
      email: Type.String({ description: "AIOT account email address" }),
      password: Type.Optional(
        Type.String({ description: "Account password (for login or signup)" }),
      ),
      code: Type.Optional(
        Type.String({ description: "6-digit OTP code from email (for verify_otp)" }),
      ),
      verification_token: Type.Optional(
        Type.String({ description: "Token from verify_otp step (for signup)" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const action = (params.action as string) || "login";
      const email = params.email as string;

      try {
        if (action === "send_otp") {
          await client.sendOtp(email, "registration");
          return {
            content: [
              {
                type: "text",
                text: `OTP sent to ${maskEmail(email)}. Ask the user for the 6-digit code from their email, then call aiot_pay_login with action: "verify_otp".`,
              },
            ],
            details: { action: "send_otp", email: maskEmail(email) },
          };
        }

        if (action === "verify_otp") {
          const code = params.code as string;
          if (!code) {
            return {
              content: [
                {
                  type: "text",
                  text: "Missing OTP code. Ask the user for the 6-digit code from their email.",
                },
              ],
            };
          }
          const result = await client.verifyOtp(email, code, "registration");
          return {
            content: [
              {
                type: "text",
                text: `OTP verified. Now call aiot_pay_login with action: "signup", email, password, and verification_token.`,
              },
            ],
            details: {
              action: "verify_otp",
              verification_token: result.verification_token,
              expires_in: result.expires_in,
            },
          };
        }

        if (action === "signup") {
          const password = params.password as string;
          const verificationToken = params.verification_token as string;
          if (!password || !verificationToken) {
            return {
              content: [
                { type: "text", text: "Missing password or verification_token for signup." },
              ],
            };
          }
          const result = await client.signup(email, password, verificationToken);
          const ttlMs = config.linkTtlDays * 24 * 60 * 60 * 1000;
          tokenService.storeToken(
            channelType,
            channelUserId,
            result.access_token,
            result.refresh_token,
            result.account.id,
            ttlMs,
          );
          return {
            content: [
              {
                type: "text",
                text: `Account created and logged in as ${maskEmail(email)}. You can now proceed with KYC and card operations.`,
              },
            ],
            details: {
              authenticated: true,
              userId: result.account.id,
              email: maskEmail(email),
              isNewAccount: true,
            },
          };
        }

        // Default: login
        const password = params.password as string;
        if (!password) {
          return {
            content: [
              {
                type: "text",
                text: "Missing password. Ask the user for their AIOT account password.",
              },
            ],
          };
        }

        // Check if already authenticated
        const existing = tokenService.getToken(channelType, channelUserId);
        if (existing) {
          return {
            content: [
              {
                type: "text",
                text: "You are already logged in. Use aiot_pay_status to check your account.",
              },
            ],
            details: { authenticated: true, userId: existing.userId },
          };
        }

        const result = await client.login(email, password);
        const ttlMs = config.linkTtlDays * 24 * 60 * 60 * 1000;
        tokenService.storeToken(
          channelType,
          channelUserId,
          result.access_token,
          result.refresh_token,
          result.account.id,
          ttlMs,
        );

        return {
          content: [
            {
              type: "text",
              text: `Logged in as ${maskEmail(email)}. You can now proceed with KYC and card operations.`,
            },
          ],
          details: {
            authenticated: true,
            userId: result.account.id,
            email: maskEmail(email),
            isNewAccount: false,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const masked = local.length <= 2 ? "*".repeat(local.length) : local[0] + "***" + local.at(-1);
  return `${masked}@${domain}`;
}
