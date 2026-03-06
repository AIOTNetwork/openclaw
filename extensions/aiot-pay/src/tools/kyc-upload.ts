import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AiotPayClient } from "../api-client.js";
import type { TokenService } from "../token-service.js";
import type { AiotPayConfig, ToolResult } from "../types.js";
import { withAuth } from "../auth.js";
import { AiotPayError, formatError } from "../errors.js";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

type ToolContext = {
  messageChannel?: string;
  agentAccountId?: string;
  sessionKey?: string;
};

export function createKycUploadTool(
  config: AiotPayConfig,
  client: AiotPayClient,
  tokenService: TokenService,
  ctx: ToolContext,
) {
  return {
    name: "aiot_pay_kyc_upload",
    label: "AIOT Pay KYC Upload",
    description:
      "Upload a KYC identity document (passport, national ID, selfie, proof of address). Accepted: JPG, PNG, PDF (max 15MB).",
    parameters: Type.Object({
      document_type: Type.Unsafe<string>({
        type: "string",
        enum: [
          "PassportFront",
          "PassportBack",
          "NationalIdFront",
          "NationalIdBack",
          "DrivingLicenseFront",
          "DrivingLicenseBack",
          "HandHeldId",
          "Selfie",
          "LivenessCheck",
          "ProofOfAddress",
          "UtilityBill",
          "BankStatement",
          "RentalAgreement",
          "TaxDocument",
          "Other",
        ],
        description: "Type of document to upload",
      }),
      file_path: Type.String({ description: "Absolute path to the document file on disk" }),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<ToolResult> {
      const docType = params.document_type as string;
      const filePath = params.file_path as string;

      if (!docType || !filePath) {
        return {
          content: [{ type: "text", text: "Missing document_type or file_path." }],
        };
      }

      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text", text: `File not found: ${filePath}` }],
        };
      }

      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) {
        return {
          content: [
            {
              type: "text",
              text: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum is 15MB.`,
            },
          ],
        };
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ALLOWED_MIME[ext];
      if (!mimeType) {
        return {
          content: [
            { type: "text", text: `Unsupported file type: ${ext}. Accepted: JPG, PNG, PDF.` },
          ],
        };
      }

      try {
        const fileData = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        const result = await withAuth(ctx, config, client, tokenService, (token) =>
          client.uploadKycDocument(token, docType, fileData, fileName, mimeType),
        );

        return {
          content: [
            {
              type: "text",
              text: `Document uploaded: ${docType} (${fileName}). Status: ${result.status}. Use aiot_pay_kyc_check to see remaining document requirements.`,
            },
          ],
          details: {
            document_id: result.document_id,
            document_type: docType,
            status: result.status,
          },
        };
      } catch (err) {
        if (err instanceof AiotPayError) return formatError(err);
        throw err;
      }
    },
  };
}
