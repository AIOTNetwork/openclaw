// --- Plugin config ---

export type AiotPayConfig = {
  serverBaseUrl: string;
  requestTimeoutMs: number;
  linkTtlDays: number;
};

export const defaultConfig: AiotPayConfig = {
  serverBaseUrl: "http://localhost:8080",
  requestTimeoutMs: 15000,
  linkTtlDays: 7,
};

export function parseConfig(raw: Record<string, unknown> | undefined): AiotPayConfig {
  return {
    serverBaseUrl:
      typeof raw?.serverBaseUrl === "string" ? raw.serverBaseUrl : defaultConfig.serverBaseUrl,
    requestTimeoutMs:
      typeof raw?.requestTimeoutMs === "number"
        ? raw.requestTimeoutMs
        : defaultConfig.requestTimeoutMs,
    linkTtlDays: typeof raw?.linkTtlDays === "number" ? raw.linkTtlDays : defaultConfig.linkTtlDays,
  };
}

// --- Auth — Login response (from POST /auth/login or /auth/signup) ---

export type LoginResponse = {
  account: {
    id: string;
    email: string;
    wallet_address?: string;
    masterpay_user_uuid?: string;
    partner_id: string;
    status: string; // "active" | "locked"
    role: string;
    last_login_at?: string;
    created_at: string;
  };
  access_token: string;
  refresh_token: string;
  is_new_account: boolean;
};

// --- Auth context (resolved per-request) ---

export type ResolvedAuth = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  source: "platform" | "linked";
  expiresAt?: number;
};

// --- Token service storage ---

export type StoredToken = {
  channelType: string;
  channelUserId: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
};

// --- KYC ---

export type KycStatus = "pending" | "submitted" | "in_review" | "approved" | "rejected";

export type KycStatusResponse = {
  status: KycStatus;
  is_pending: boolean;
  documents: Record<string, string>;
  reason?: string;
  submitted_at?: string;
  reviewed_at?: string;
  last_updated_at: string;
};

// Backend field names: english_first_name, english_last_name, source_of_fund, phone_number
export type KycSubmitRequest = {
  english_first_name: string;
  english_last_name: string;
  gender: string; // "male" | "female" | "other"
  dob: string; // ISO 8601 date
  phone_number: string;
  nationality: string; // country code
  occupation: string;
  source_of_fund: string; // "Employment" | "Business" | "Investment" | etc.
  chinese_first_name?: string;
  chinese_last_name?: string;
  middle_name?: string;
  country?: string;
  passport?: string;
  nric?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  city?: string;
  state?: string;
  zip?: string;
  billing_same_as_home?: boolean;
  billing_country?: string;
  billing_address1?: string;
  billing_address2?: string;
  billing_address3?: string;
  billing_city?: string;
  billing_state?: string;
  billing_zip?: string;
};

export type KycMetadataResponse = {
  document_types: Array<{ value: string; display_name: string }>;
  occupation_types: Array<{ value: string; display_name: string }>;
  nationality_types: Array<{ code: string; display_name: string }>;
  source_of_fund_types: Array<{ value: string; display_name: string }>;
  countries: Array<{
    alpha2: string;
    alpha3: string;
    en: string;
    zh?: string;
    country_code: string;
    mobile_code: string;
    nice_name: string;
  }>;
};

export type KycDocumentType =
  | "PassportFront"
  | "PassportBack"
  | "NationalIdFront"
  | "NationalIdBack"
  | "DrivingLicenseFront"
  | "DrivingLicenseBack"
  | "HandHeldId"
  | "Selfie"
  | "LivenessCheck"
  | "ProofOfAddress"
  | "UtilityBill"
  | "BankStatement"
  | "RentalAgreement"
  | "TaxDocument"
  | "Other";

// --- Cards ---

// Card creation response (masked PAN)
export type CardCreateResponse = {
  id: number;
  uuid: string;
  user_id: string;
  card_id: string;
  number: string; // MASKED: ************8134
  holder_name: string;
  amount: number;
  type: string; // "Virtual"
  expiry: string; // MM/YY
  issued: string; // DD/MM/YY
  last_4: string;
  status: string; // "Active" | "Locked" | "Cancelled"
  pin: string; // Card PIN (for ATM/POS) — NOT transaction PIN
  year: string; // MASKED: ****
  month: string; // MASKED: ****
};

// Card details response (full PAN + CVV, requires transaction PIN)
export type CardDetailsResponse = {
  card_number: string; // FULL unmasked PAN
  cvv: string;
  expiry: string;
  holder_name: string;
};

// Card list item
export type CardListItem = {
  uuid: string;
  number: string; // masked
  holder_name: string;
  amount: number;
  type: string;
  expiry: string;
  last_4: string;
  status: string;
};

// --- Wallet / Balance ---

export type WalletResponse = {
  uuid: string;
  name: string;
  currency: string;
  balance: number;
  available_balance: number;
  status: string;
  kyc_required: boolean;
  kyc_level: string;
  created_at: string;
};

export type BalanceResponse = {
  balance: number;
  available_balance: number;
  currency: string;
};

// --- Crypto wallet (for top-up) ---

export type CoinInfo = {
  coin_id: string;
  name: string;
  symbol: string;
  networks: Array<{ network_id: string; name: string }>;
};

export type DepositAddress = {
  address: string;
  network: string;
  coin: string;
  memo?: string;
};

// --- Tool return (lobster.cash pattern) ---

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
};
