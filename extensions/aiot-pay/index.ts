import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolFactory,
} from "../../src/plugins/types.js";
import { AiotPayClient } from "./src/api-client.js";
import { TokenService } from "./src/token-service.js";
import { createCardDetailsTool } from "./src/tools/card-details.js";
import { createCardTool } from "./src/tools/create-card.js";
import { createKycCheckTool } from "./src/tools/kyc-check.js";
import { createKycSubmitTool } from "./src/tools/kyc-submit.js";
import { createKycUploadTool } from "./src/tools/kyc-upload.js";
import { createLinkAccountTool } from "./src/tools/link-account.js";
import { createListCardsTool } from "./src/tools/list-cards.js";
import { createLoginTool } from "./src/tools/login.js";
import { createManageCardTool } from "./src/tools/manage-card.js";
import { createPayTool } from "./src/tools/pay.js";
import { createStatusTool } from "./src/tools/status.js";
import { createTopUpTool } from "./src/tools/top-up.js";
import { parseConfig } from "./src/types.js";

export default function register(api: OpenClawPluginApi) {
  const config = parseConfig(api.pluginConfig as Record<string, unknown> | undefined);
  const client = new AiotPayClient(config);
  const dbPath = api.resolvePath("~/.openclaw/aiot-pay");
  const tokenService = new TokenService(dbPath);

  // Each tool is registered as a factory that receives per-request context
  // (messageChannel, agentAccountId, sessionKey) and returns the tool instance.
  const reg = (
    name: string,
    fn: (ctx: { messageChannel?: string; agentAccountId?: string; sessionKey?: string }) => unknown,
  ) => {
    api.registerTool(((ctx) => fn(ctx) as AnyAgentTool) as OpenClawPluginToolFactory, { name });
  };

  reg("aiot_pay_login", (ctx) => createLoginTool(config, client, tokenService, ctx));
  reg("aiot_pay_link_account", () => createLinkAccountTool());
  reg("aiot_pay_status", (ctx) => createStatusTool(config, client, tokenService, ctx));
  reg("aiot_pay_kyc_check", (ctx) => createKycCheckTool(config, client, tokenService, ctx));
  reg("aiot_pay_kyc_submit", (ctx) => createKycSubmitTool(config, client, tokenService, ctx));
  reg("aiot_pay_kyc_upload", (ctx) => createKycUploadTool(config, client, tokenService, ctx));
  reg("aiot_pay_create_card", (ctx) => createCardTool(config, client, tokenService, ctx));
  reg("aiot_pay_card_details", (ctx) => createCardDetailsTool(config, client, tokenService, ctx));
  reg("aiot_pay_top_up", (ctx) => createTopUpTool(config, client, tokenService, ctx));
  reg("aiot_pay_pay", (ctx) => createPayTool(config, client, tokenService, ctx));
  reg("aiot_pay_list_cards", (ctx) => createListCardsTool(config, client, tokenService, ctx));
  reg("aiot_pay_manage_card", (ctx) => createManageCardTool(config, client, tokenService, ctx));

  api.logger.info(`AIOT Pay plugin loaded (server=${config.serverBaseUrl})`);
}
