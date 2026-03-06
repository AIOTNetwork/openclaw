import type { AiotPayClient } from "./api-client.js";
import type { TokenService } from "./token-service.js";
import type { AiotPayConfig, ResolvedAuth } from "./types.js";
import { AiotPayError, ErrorCode } from "./errors.js";

type ToolContext = {
  messageChannel?: string;
  agentAccountId?: string;
  sessionKey?: string;
  // Platform-injected auth (AIOT platform mode)
  sessionData?: {
    accessToken?: string;
    refreshToken?: string;
    userId?: string;
  };
};

/**
 * Resolve authentication for the current request.
 * Priority: platform-injected token > token service lookup.
 */
export function resolveAuth(ctx: ToolContext, tokenService: TokenService): ResolvedAuth | null {
  // Mode 1: Platform-injected token
  if (ctx.sessionData?.accessToken && ctx.sessionData?.refreshToken) {
    return {
      accessToken: ctx.sessionData.accessToken,
      refreshToken: ctx.sessionData.refreshToken,
      userId: ctx.sessionData.userId ?? "",
      source: "platform",
    };
  }

  // Mode 2: Token service lookup by channel + user
  const channelType = ctx.messageChannel ?? "unknown";
  const channelUserId = ctx.agentAccountId ?? ctx.sessionKey ?? "";
  if (!channelUserId) return null;

  const stored = tokenService.getToken(channelType, channelUserId);
  if (!stored) return null;

  return {
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    userId: stored.userId,
    source: "linked",
    expiresAt: stored.expiresAt,
  };
}

/**
 * Execute an API call with authentication. Handles auto-refresh on 401.
 */
export async function withAuth<T>(
  ctx: ToolContext,
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const auth = resolveAuth(ctx, tokenService);
  if (!auth) {
    throw new AiotPayError(ErrorCode.NOT_AUTHENTICATED, "Not authenticated. Please log in first.");
  }

  try {
    return await fn(auth.accessToken);
  } catch (err) {
    // Auto-refresh on 401 (token expired)
    if (err instanceof AiotPayError && err.statusCode === 401 && auth.refreshToken) {
      try {
        const refreshed = await client.refreshToken(auth.refreshToken);

        // Update token service if this was a linked token
        if (auth.source === "linked") {
          const channelType = ctx.messageChannel ?? "unknown";
          const channelUserId = ctx.agentAccountId ?? ctx.sessionKey ?? "";
          tokenService.updateAccessToken(channelType, channelUserId, refreshed.access_token);
        }

        // Retry with new token
        return await fn(refreshed.access_token);
      } catch {
        throw new AiotPayError(
          ErrorCode.REFRESH_FAILED,
          "Session expired and refresh failed. Please log in again.",
        );
      }
    }

    throw err;
  }
}
