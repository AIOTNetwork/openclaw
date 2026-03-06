import { Type } from "@sinclair/typebox";
import type { AiotPayClient } from "../api-client.js";
import type { TokenService } from "../token-service.js";
import type { AiotPayConfig, KycSubmitRequest, ToolResult } from "../types.js";
import { withAuth } from "../auth.js";
import { AiotPayError, formatError } from "../errors.js";

type ToolContext = {
  messageChannel?: string;
  agentAccountId?: string;
  sessionKey?: string;
};

export function createKycSubmitTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_kyc_submit",
    label: "AIOT Pay KYC Submit",
    description:
      "Submit KYC profile data (name, date of birth, nationality, etc.) for identity verification.",
    parameters: Type.Object({
      english_first_name: Type.String({ description: "First name in English" }),
      english_last_name: Type.String({ description: "Last name in English" }),
      gender: Type.Unsafe<"male" | "female" | "other">({
        type: "string",
        enum: ["male", "female", "other"],
        description: "Gender",
      }),
      dob: Type.String({ description: "Date of birth (YYYY-MM-DD)" }),
      phone_number: Type.String({ description: "Phone number with country code" }),
      nationality: Type.String({ description: "Nationality country code (e.g. US, HK, SG)" }),
      occupation: Type.String({ description: "Occupation" }),
      source_of_fund: Type.String({
        description: "Source of funds (e.g. Employment, Business, Investment)",
      }),
      country: Type.Optional(Type.String({ description: "Country of residence" })),
      passport: Type.Optional(Type.String({ description: "Passport number" })),
      address1: Type.Optional(Type.String({ description: "Address line 1" })),
      city: Type.Optional(Type.String({ description: "City" })),
      state: Type.Optional(Type.String({ description: "State/province" })),
      zip: Type.Optional(Type.String({ description: "Postal/ZIP code" })),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const required = [
        "english_first_name",
        "english_last_name",
        "gender",
        "dob",
        "phone_number",
        "nationality",
        "occupation",
        "source_of_fund",
      ] as const;

      for (const field of required) {
        if (!params[field]) {
          return {
            content: [
              {
                type: "text",
                text: `Missing required field: ${field}. Please provide all required KYC fields.`,
              },
            ],
          };
        }
      }

      try {
        const data: KycSubmitRequest = {
          english_first_name: params.english_first_name as string,
          english_last_name: params.english_last_name as string,
          gender: params.gender as string,
          dob: params.dob as string,
          phone_number: params.phone_number as string,
          nationality: params.nationality as string,
          occupation: params.occupation as string,
          source_of_fund: params.source_of_fund as string,
        };

        if (params.country) data.country = params.country as string;
        if (params.passport) data.passport = params.passport as string;
        if (params.address1) data.address1 = params.address1 as string;
        if (params.city) data.city = params.city as string;
        if (params.state) data.state = params.state as string;
        if (params.zip) data.zip = params.zip as string;

        const result = await withAuth(ctx, config, client, tokenService, (token) =>
          client.submitKyc(token, data),
        );

        return {
          content: [
            {
              type: "text",
              text: `KYC profile submitted successfully. Status: ${result.status}. ${result.message}\n\nNext step: Upload identity documents using aiot_pay_kyc_upload if required.`,
            },
          ],
          details: {
            status: result.status,
            submitted_at: result.submitted_at,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
