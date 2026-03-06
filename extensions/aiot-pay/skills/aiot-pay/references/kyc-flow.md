# KYC Flow Reference

## KYC States

```
pending → submitted → in_review → approved
                                → rejected → (resubmit) → submitted
```

- **pending**: No data submitted yet
- **submitted**: Profile data and/or documents submitted, awaiting review
- **in_review**: Being reviewed by MasterPay
- **approved**: Verified — wallets auto-created, card creation enabled
- **rejected**: Failed verification — check `reason` field, resubmit corrected data

## Required Profile Fields

These fields use exact backend names (snake_case):

| Field                | Type                          | Example             |
| -------------------- | ----------------------------- | ------------------- |
| `english_first_name` | string                        | "John"              |
| `english_last_name`  | string                        | "Doe"               |
| `gender`             | "male" \| "female" \| "other" | "male"              |
| `dob`                | ISO 8601 date                 | "1990-01-15"        |
| `phone_number`       | string with country code      | "+85212345678"      |
| `nationality`        | country code                  | "HK"                |
| `occupation`         | string                        | "Software Engineer" |
| `source_of_fund`     | string                        | "Employment"        |

## Optional Profile Fields

| Field                                                       | Description            |
| ----------------------------------------------------------- | ---------------------- |
| `chinese_first_name`                                        | Chinese first name     |
| `chinese_last_name`                                         | Chinese last name      |
| `middle_name`                                               | Middle name            |
| `country`                                                   | Country of residence   |
| `passport`                                                  | Passport number        |
| `nric`                                                      | National ID number     |
| `address1` / `address2` / `address3`                        | Address lines          |
| `city`                                                      | City                   |
| `state`                                                     | State/province         |
| `zip`                                                       | Postal code            |
| `billing_same_as_home`                                      | Boolean                |
| `billing_country/address1/address2/address3/city/state/zip` | Billing address fields |

## Document Types

PascalCase values accepted by the upload endpoint:

| Document Type         | Description              |
| --------------------- | ------------------------ |
| `PassportFront`       | Front of passport        |
| `PassportBack`        | Back of passport         |
| `NationalIdFront`     | Front of national ID     |
| `NationalIdBack`      | Back of national ID      |
| `DrivingLicenseFront` | Front of driving license |
| `DrivingLicenseBack`  | Back of driving license  |
| `HandHeldId`          | Photo holding ID         |
| `Selfie`              | Selfie photo             |
| `LivenessCheck`       | Liveness verification    |
| `ProofOfAddress`      | Proof of address         |
| `UtilityBill`         | Utility bill             |
| `BankStatement`       | Bank statement           |
| `RentalAgreement`     | Rental agreement         |
| `TaxDocument`         | Tax document             |
| `Other`               | Other document           |

## Upload Specifications

- **Endpoint**: `POST /api/v1/masterpay/kyc/documents`
- **Method**: Multipart form data
- **Fields**:
  - `document_type`: One of the PascalCase types above
  - `file`: The document file
- **Max size**: 15MB per file
- **Accepted formats**: JPG, PNG, PDF
- **Authentication**: Bearer token required

## Document Status Values

| Status          | Meaning                      |
| --------------- | ---------------------------- |
| `not_submitted` | Document not yet uploaded    |
| `not_uploaded`  | Expected but not provided    |
| `uploaded`      | Received, pending review     |
| `pending`       | In review queue              |
| `approved`      | Accepted                     |
| `rejected`      | Not accepted — must resubmit |

## Metadata Endpoint

`GET /api/v1/masterpay/kyc/metadata` returns structured options:

- `document_types`: `[{ value, display_name }]`
- `occupation_types`: `[{ value, display_name }]`
- `nationality_types`: `[{ code, display_name }]`
- `source_of_fund_types`: `[{ value, display_name }]`
- `countries`: `[{ alpha2, alpha3, en, zh?, country_code, mobile_code, nice_name }]`

## Notes

- **No webhooks** — KYC status must be polled via `GET /api/v1/masterpay/kyc/status`
- KYC approval triggers automatic wallet creation by MasterPay
- Rejected KYC includes a `reason` field explaining what needs correction
- Documents can be uploaded incrementally — check the document checklist to see what's remaining
