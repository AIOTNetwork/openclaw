import type {
  AiotPayConfig,
  BalanceResponse,
  CardCreateResponse,
  CardDetailsResponse,
  CardListItem,
  CoinInfo,
  DepositAddress,
  KycMetadataResponse,
  KycStatusResponse,
  KycSubmitRequest,
  LoginResponse,
  WalletResponse,
} from "./types.js";
import { AiotPayError, ErrorCode } from "./errors.js";

type RequestOpts = {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

export class AiotPayClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: AiotPayConfig) {
    this.baseUrl = config.serverBaseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.requestTimeoutMs;
  }

  // ---------------------------------------------------------------------------
  // Auth — Login (demo, works today)
  // ---------------------------------------------------------------------------

  async login(email: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>("POST", "/api/v1/auth/login", {
      body: { email, password },
    });
  }

  async sendOtp(email: string, type: string): Promise<{ message: string }> {
    return this.request<{ message: string }>("POST", "/api/v1/auth/otp/send", {
      body: { email, type },
    });
  }

  async verifyOtp(
    email: string,
    code: string,
    type: string,
  ): Promise<{ verification_token: string; expires_in: number }> {
    return this.request<{ verification_token: string; expires_in: number }>(
      "POST",
      "/api/v1/auth/otp/verify",
      { body: { email, code, type } },
    );
  }

  async signup(email: string, password: string, verificationToken: string): Promise<LoginResponse> {
    return this.request<LoginResponse>("POST", "/api/v1/auth/signup", {
      body: { email, password, verification_token: verificationToken },
    });
  }

  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    return this.request<{ access_token: string }>("POST", "/api/v1/auth/refresh", {
      body: { refresh_token: refreshToken },
    });
  }

  // ---------------------------------------------------------------------------
  // Account Linking (DEFERRED — stubs)
  // ---------------------------------------------------------------------------

  async initiateLinkAccount(
    _channelType: string,
    _channelUserId: string,
    _agentId?: string,
  ): Promise<{ state: string; consent_url: string; expires_at: number }> {
    throw new AiotPayError(
      ErrorCode.GATEWAY_ERROR,
      "Account linking via consent URL is not yet available. Please use aiot_pay_login instead.",
    );
  }

  async getLinkStatus(_state: string): Promise<{
    status: "pending" | "approved" | "expired";
    access_token?: string;
    refresh_token?: string;
    user_id?: string;
    expires_at?: number;
  }> {
    throw new AiotPayError(
      ErrorCode.GATEWAY_ERROR,
      "Account linking via consent URL is not yet available. Please use aiot_pay_login instead.",
    );
  }

  // ---------------------------------------------------------------------------
  // KYC
  // ---------------------------------------------------------------------------

  async getKycStatus(token: string): Promise<KycStatusResponse> {
    return this.request<KycStatusResponse>("GET", "/api/v1/masterpay/kyc/status", { token });
  }

  async getKycMetadata(token: string): Promise<KycMetadataResponse> {
    return this.request<KycMetadataResponse>("GET", "/api/v1/masterpay/kyc/metadata", { token });
  }

  async submitKyc(
    token: string,
    data: KycSubmitRequest,
  ): Promise<{ status: string; submitted_at: string; message: string }> {
    return this.request<{ status: string; submitted_at: string; message: string }>(
      "POST",
      "/api/v1/masterpay/kyc/submit",
      { token, body: data },
    );
  }

  async uploadKycDocument(
    token: string,
    docType: string,
    fileData: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<{ document_id: string; status: string }> {
    const formData = new FormData();
    formData.append("document_type", docType);
    formData.append("file", new Blob([new Uint8Array(fileData)], { type: mimeType }), fileName);

    const url = `${this.baseUrl}/api/v1/masterpay/kyc/documents`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: AbortSignal.timeout(this.timeoutMs),
    }).catch((err) => {
      throw this.mapFetchError(err);
    });

    return this.handleResponse<{ document_id: string; status: string }>(resp);
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------

  async createSingleUseCard(token: string, walletUuid?: string): Promise<CardCreateResponse> {
    return this.request<CardCreateResponse>("POST", "/api/v1/masterpay/cards/single-use", {
      token,
      body: walletUuid ? { wallet_uuid: walletUuid } : undefined,
    });
  }

  async createMultiUseCard(token: string, walletUuid?: string): Promise<CardCreateResponse> {
    return this.request<CardCreateResponse>("POST", "/api/v1/masterpay/cards/multi-use", {
      token,
      body: walletUuid ? { wallet_uuid: walletUuid } : undefined,
    });
  }

  async getCardDetails(token: string, cardId: string, pin: string): Promise<CardDetailsResponse> {
    return this.request<CardDetailsResponse>("POST", `/api/v1/masterpay/cards/${cardId}/details`, {
      token,
      body: { pin },
    });
  }

  async listCards(token: string, walletUuid?: string): Promise<CardListItem[]> {
    const path = walletUuid
      ? `/api/v1/masterpay/wallets/${walletUuid}/cards`
      : "/api/v1/masterpay/wallets/cards";
    const resp = await this.request<{ cards: CardListItem[] }>("GET", path, { token });
    return resp.cards ?? [];
  }

  async getCard(token: string, cardId: string): Promise<CardListItem> {
    return this.request<CardListItem>("GET", `/api/v1/masterpay/cards/${cardId}`, { token });
  }

  async lockCard(token: string, cardId: string, pin: string): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", `/api/v1/masterpay/cards/${cardId}/lock`, {
      token,
      body: { pin },
    });
  }

  async unlockCard(token: string, cardId: string, pin: string): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", `/api/v1/masterpay/cards/${cardId}/unlock`, {
      token,
      body: { pin },
    });
  }

  async cancelCard(token: string, cardId: string, pin: string): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", `/api/v1/masterpay/cards/${cardId}/cancel`, {
      token,
      body: { pin },
    });
  }

  // ---------------------------------------------------------------------------
  // Card top-up (direct amount funding — backend currently mocked)
  // ---------------------------------------------------------------------------

  async topUpCard(
    token: string,
    cardId: string,
    amount: number,
    currency?: string,
  ): Promise<{ transaction_id: string; new_balance: number; status: string }> {
    return this.request<{ transaction_id: string; new_balance: number; status: string }>(
      "POST",
      `/api/v1/masterpay/cards/${cardId}/top-up`,
      { token, body: { amount, currency } },
    );
  }

  // ---------------------------------------------------------------------------
  // Wallet / Balance
  // ---------------------------------------------------------------------------

  async getBalance(token: string): Promise<BalanceResponse> {
    return this.request<BalanceResponse>("GET", "/api/v1/masterpay/balance", { token });
  }

  async listWallets(token: string): Promise<WalletResponse[]> {
    const resp = await this.request<{ wallets: WalletResponse[] }>(
      "GET",
      "/api/v1/masterpay/wallets",
      { token },
    );
    return resp.wallets ?? [];
  }

  // ---------------------------------------------------------------------------
  // Crypto wallet (for manual crypto top-up)
  // ---------------------------------------------------------------------------

  async getCoins(token: string): Promise<CoinInfo[]> {
    const resp = await this.request<{ coins: CoinInfo[] }>("GET", "/api/v1/wallet/coins", {
      token,
    });
    return resp.coins ?? [];
  }

  async getCoinNetworks(
    token: string,
    coinId: string,
  ): Promise<Array<{ network_id: string; name: string }>> {
    const resp = await this.request<{ networks: Array<{ network_id: string; name: string }> }>(
      "GET",
      `/api/v1/wallet/coins/${coinId}/networks`,
      { token },
    );
    return resp.networks ?? [];
  }

  async getDepositAddress(
    token: string,
    coinId: string,
    networkId: string,
  ): Promise<DepositAddress> {
    return this.request<DepositAddress>("POST", "/api/v1/wallet/deposit/address", {
      token,
      body: { coin_id: coinId, network_id: networkId },
    });
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async ping(): Promise<boolean> {
    try {
      await this.request<unknown>("GET", "/api/v1/health", { timeoutMs: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async request<T>(method: string, path: string, opts?: RequestOpts): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...opts?.headers,
    };
    if (opts?.token) {
      headers["Authorization"] = `Bearer ${opts.token}`;
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts?.timeoutMs ?? this.timeoutMs),
    }).catch((err) => {
      throw this.mapFetchError(err);
    });

    return this.handleResponse<T>(resp);
  }

  private async handleResponse<T>(resp: Response): Promise<T> {
    let body: ApiResponse<T>;
    try {
      body = (await resp.json()) as ApiResponse<T>;
    } catch {
      throw new AiotPayError(
        ErrorCode.GATEWAY_ERROR,
        `Unexpected response (HTTP ${resp.status})`,
        resp.status,
      );
    }

    if (!resp.ok || body.success === false) {
      const errCode = body.error?.code ?? "";
      const errMsg = body.error?.message ?? `HTTP ${resp.status}`;
      throw this.mapApiError(resp.status, errCode, errMsg);
    }

    // The AIOT backend wraps responses as { success: true, data: T }
    // Some endpoints return data directly at the top level
    return (body.data ?? body) as T;
  }

  private mapApiError(status: number, code: string, message: string): AiotPayError {
    if (status === 401) {
      if (code === "ACCOUNT_LOCKED") {
        return new AiotPayError(ErrorCode.ACCOUNT_LOCKED, message, status);
      }
      return new AiotPayError(ErrorCode.INVALID_CREDENTIALS, message, status);
    }
    if (status === 403) {
      if (code === "ACCOUNT_LOCKED") {
        return new AiotPayError(ErrorCode.ACCOUNT_LOCKED, message, status);
      }
      return new AiotPayError(ErrorCode.TOKEN_EXPIRED, message, status);
    }
    if (status === 404 && code === "NO_WALLETS") {
      return new AiotPayError(ErrorCode.NO_WALLETS, message, status);
    }
    if (status === 429) {
      return new AiotPayError(ErrorCode.GATEWAY_ERROR, `Rate limited: ${message}`, status);
    }
    if (code === "VALIDATION_ERROR") {
      return new AiotPayError(ErrorCode.VALIDATION_ERROR, message, status);
    }
    if (code === "CARD_CREATION_FAILED") {
      return new AiotPayError(ErrorCode.CARD_CREATION_FAILED, message, status);
    }
    return new AiotPayError(ErrorCode.GATEWAY_ERROR, message, status);
  }

  private mapFetchError(err: unknown): AiotPayError {
    if (err instanceof DOMException && err.name === "AbortError") {
      return new AiotPayError(ErrorCode.TIMEOUT, "Request timed out");
    }
    if (err instanceof TypeError && String(err.message).includes("fetch")) {
      return new AiotPayError(
        ErrorCode.BACKEND_UNREACHABLE,
        "Cannot connect to AIOT Payment server",
      );
    }
    return new AiotPayError(ErrorCode.UNKNOWN, String(err));
  }
}
