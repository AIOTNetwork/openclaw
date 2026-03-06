---
name: aiot-pay
description: Agent payment skill for virtual cards via AIOT Pay (MasterPay Global). Activate when user wants to create a virtual card, complete KYC, check balance, top up, or manage cards.
metadata: { "openclaw": { "emoji": "💳" } }
---

# AIOT Pay — Virtual Card & Payment Agent

## Hard Rules

1. NEVER store, log, or repeat the user's transaction PIN after receiving it
2. NEVER store, log, or repeat the user's password after receiving it
3. NEVER repeat full card details (PAN, CVV) — always refer user to the saved file
4. NEVER claim a card was created unless the API response confirms success
5. ALWAYS check KYC status before card creation — KYC must be "approved"
6. ALWAYS check if user is authenticated first — if not, use aiot_pay_login (third-party) or check platform config
7. ALWAYS ask user for their transaction PIN fresh each time for card details or lock/unlock/cancel
8. NEVER call aiot_pay_login when running inside the AIOT platform (auth is automatic)
9. Card PIN (returned on creation, for ATM/POS) is DIFFERENT from transaction PIN (user's security PIN)

## Tool Selection

| User wants to...                                   | Tool                                               |
| -------------------------------------------------- | -------------------------------------------------- |
| Log in to their AIOT account (Discord/Telegram)    | `aiot_pay_login`                                   |
| Check account overview                             | `aiot_pay_status`                                  |
| Check KYC status                                   | `aiot_pay_kyc_check`                               |
| Submit KYC information                             | `aiot_pay_kyc_submit`                              |
| Upload identity documents                          | `aiot_pay_kyc_upload`                              |
| Apply for a virtual card (multi-use or single-use) | `aiot_pay_create_card`                             |
| Buy something (agent handles everything)           | `aiot_pay_pay` (transaction PIN required)          |
| Get full card number + CVV                         | `aiot_pay_card_details` (transaction PIN required) |
| Top up a card wallet                               | `aiot_pay_top_up`                                  |
| List existing cards                                | `aiot_pay_list_cards`                              |
| Lock/unlock/cancel a card                          | `aiot_pay_manage_card` (transaction PIN required)  |

## First-Time Flow (Third-Party Channel — Discord/Telegram)

1. Call `aiot_pay_status` — if not authenticated:
2. Ask user: "Do you have an AIOT account?"
3. **If yes (existing user):**
   - Ask for their email and password
   - Call `aiot_pay_login` with `{ email, password }`
   - On success → proceed to KYC check
4. **If no (new user):**
   - Ask for their email
   - Call `aiot_pay_login` with `{ action: "send_otp", email }` → OTP sent to email
   - Ask user for the 6-digit code from their email
   - Call `aiot_pay_login` with `{ action: "verify_otp", email, code }`
   - Ask user to choose a password
   - Call `aiot_pay_login` with `{ action: "signup", email, password, verification_token }`
   - On success → proceed to KYC check
5. Call `aiot_pay_status` to verify authentication
6. NEVER repeat the user's password back to them

## First-Time Flow (AIOT Platform)

1. Call `aiot_pay_status` — auth is automatic, check KYC status
2. If KYC not approved → guide through KYC (see below)
3. Once KYC approved → ready to create cards

## KYC Flow

1. Call `aiot_pay_kyc_check` to see what's needed
2. Collect data from user:
   - Required: first name, last name, gender, date of birth, phone number, nationality, occupation, source of funds
3. Call `aiot_pay_kyc_submit` with the data
4. If documents needed: ask user for file paths, call `aiot_pay_kyc_upload` for each
   - Common documents: PassportFront, NationalIdFront, Selfie, ProofOfAddress
   - Accepted formats: JPG, PNG, PDF (max 15MB)
5. Inform user to wait for KYC approval (can check later with aiot_pay_kyc_check)
6. Note: KYC status must be polled — there are no push notifications

## Flow A: "I Want a Card" (Multi-Use)

User explicitly asks for a virtual card to keep and use multiple times.

1. Ensure KYC is approved (guide through KYC flow if not)
2. Call `aiot_pay_create_card` with `type: "multi-use"` → returns masked PAN + card PIN
3. Tell user: "Card created! Last 4 digits: {last4}. Card PIN for ATM/POS: {pin}"
4. Ask user: "Would you like me to retrieve the full card number? You'll need your transaction PIN."
5. If yes: call `aiot_pay_card_details` with card UUID + transaction PIN → saves to file
6. Tell user: "Full card details saved to {filePath}. Open that file to see the card number and CVV."
7. User can now top up and use the card at any merchant, multiple times

## Flow B: "I Want to Buy X" (Single-Use Orchestrated)

User wants to purchase something. Agent handles the full flow.

1. Ensure KYC is approved (guide through KYC flow if not)
2. Determine the purchase amount and currency
3. Ask user for their transaction PIN (needed for card details)
4. Call `aiot_pay_pay` with `{ amount, currency, merchant, description, pin }`:
   - Agent automatically: creates single-use card → tops up exact amount → gets full details → saves to file
5. Returns `{ cardId, maskedPan, expiry, filePath, amount, status: "ready_to_pay" }`
6. Agent uses the card details to complete the purchase (via another skill, external API, or provides to user)
7. Card auto-disposes after the single transaction
8. Do NOT read or repeat the full card number from the file

**Note:** If `aiot_pay_pay` fails at any step (e.g., top-up fails), it automatically rolls back by cancelling the created card.

## Top-Up Flow

For adding funds to an existing card wallet:

1. Call `aiot_pay_top_up` with `{ card_id, amount }` → fund the card with the specified amount
2. Returns confirmation with new balance and transaction ID
3. Note: backend top-up is currently mocked — the tool is implemented with the expected interface

For manual crypto deposit (advanced):

1. Call `aiot_pay_top_up` with `{ mode: "crypto" }` → shows available cryptocurrencies
2. User picks a coin (e.g., USDC) → call with `{ mode: "crypto", coin_id }`
3. User picks a network (e.g., Solana) → call with `{ mode: "crypto", coin_id, network_id }`
4. Returns deposit address — user sends crypto to that address
5. Funds appear in wallet balance after blockchain confirmation

## Session Expiration

For linked accounts (Discord/Telegram):

- Links expire after the configured TTL (default 7 days)
- If expired, agent will prompt to re-authenticate via aiot_pay_login
- Users can revoke links from the AIOT platform dashboard

## Error Recovery

| Error                   | Action                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- |
| Not authenticated       | Run `aiot_pay_login` (third-party) or check platform config                       |
| Login failed (401)      | "Invalid email or password. Please try again."                                    |
| Account locked (403)    | "Account locked due to too many failed attempts. Unlock via AIOT platform."       |
| Token expired           | Automatic refresh; if refresh fails, ask user to login again via `aiot_pay_login` |
| KYC not approved        | Run `aiot_pay_kyc_check`, guide user                                              |
| No wallet available     | KYC must be approved first — wallets auto-created                                 |
| Invalid PIN             | Ask user to re-enter (max 5 attempts before lockout)                              |
| Account locked          | User must unlock via email verification on AIOT platform                          |
| Backend unreachable     | Check if AIOT Payment server is running                                           |
| Insufficient balance    | Guide user to top up via `aiot_pay_top_up`                                        |
| Pay tool fails mid-flow | Automatic rollback (cancel created card). Ask user to retry.                      |
