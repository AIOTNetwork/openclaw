export enum ErrorCode {
  // Auth
  NOT_AUTHENTICATED = "NOT_AUTHENTICATED",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  REFRESH_FAILED = "REFRESH_FAILED",

  // KYC
  KYC_NOT_APPROVED = "KYC_NOT_APPROVED",
  KYC_SUBMISSION_FAILED = "KYC_SUBMISSION_FAILED",
  KYC_UPLOAD_FAILED = "KYC_UPLOAD_FAILED",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  INVALID_FILE_TYPE = "INVALID_FILE_TYPE",

  // Cards
  CARD_CREATION_FAILED = "CARD_CREATION_FAILED",
  CARD_NOT_FOUND = "CARD_NOT_FOUND",
  INVALID_PIN = "INVALID_PIN",
  NO_WALLETS = "NO_WALLETS",

  // Top-up
  TOP_UP_FAILED = "TOP_UP_FAILED",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",

  // General
  BACKEND_UNREACHABLE = "BACKEND_UNREACHABLE",
  GATEWAY_ERROR = "GATEWAY_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  TIMEOUT = "TIMEOUT",
  UNKNOWN = "UNKNOWN",
}

export class AiotPayError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiotPayError";
  }
}

/** Map error codes to user-friendly recovery instructions */
export const errorRecovery: Record<string, string> = {
  [ErrorCode.NOT_AUTHENTICATED]:
    "You need to log in first. Use aiot_pay_login with your AIOT email and password.",
  [ErrorCode.INVALID_CREDENTIALS]: "Invalid email or password. Please check and try again.",
  [ErrorCode.ACCOUNT_LOCKED]:
    "Your account is locked due to too many failed attempts. Please unlock it via the AIOT platform.",
  [ErrorCode.TOKEN_EXPIRED]: "Your session has expired. Please log in again with aiot_pay_login.",
  [ErrorCode.KYC_NOT_APPROVED]:
    "KYC verification is required before this action. Use aiot_pay_kyc_check to see what's needed.",
  [ErrorCode.INVALID_PIN]: "Invalid transaction PIN. Please re-enter your 4-digit transaction PIN.",
  [ErrorCode.NO_WALLETS]:
    "No card wallets found. Complete KYC verification first — wallets are auto-created on approval.",
  [ErrorCode.INSUFFICIENT_BALANCE]:
    "Insufficient balance. Use aiot_pay_top_up to add funds to your card.",
  [ErrorCode.BACKEND_UNREACHABLE]:
    "Cannot reach the AIOT Payment server. Please check if the server is running.",
  [ErrorCode.FILE_TOO_LARGE]: "File exceeds the 15MB size limit. Please use a smaller file.",
  [ErrorCode.INVALID_FILE_TYPE]:
    "Unsupported file type. Accepted formats: JPG, PNG, PDF (max 15MB).",
};

/** Format an AiotPayError into a user-friendly tool result */
export function formatError(error: AiotPayError): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
} {
  const recovery = errorRecovery[error.code] ?? "An unexpected error occurred. Please try again.";
  return {
    content: [{ type: "text", text: `Error: ${error.message}\n\nNext step: ${recovery}` }],
    details: { error: error.code, message: error.message, recovery },
  };
}
