# ShangGang — 港上数科 Asset Account Exporter

Automated Python script to log in to [ams.gunsun.net](https://ams.gunsun.net), fetch all asset-account (资产台账) records including debtor mobile numbers, and export the data to an Excel file.

---

## Features

- Automated login with RSA-encrypted password (matches browser behaviour)
- Full pagination support — fetches all 10,000+ records
- Enriches each record with the debtor's mobile number via a secondary API call
- Exports to a timestamped `.xlsx` file with two sheets:
  - **Asset Accounts** — all records with mobile numbers
  - **Summary** — portfolio-level statistics
- `TEST_MODE` flag for quick 10-record validation runs

---

## Project Structure

```
ShangGang/
├── gunsun_export.py   # Main export script
├── requirements.txt   # Python dependencies
└── README.md
```

---

## Requirements

- Python 3.10+
- Virtual environment at `../../.venv` (shared with sibling projects), or install dependencies manually

### Dependencies

```
requests
pycryptodome
pandas
openpyxl
python-dotenv
```

Install:

```bash
pip install -r requirements.txt
```

---

## Configuration

Copy `.env` and fill in your credentials:

```bash
cp .env .env.local   # optional — or edit .env directly
```

`.env` file:

```ini
BASE_URL=https://ams.gunsun.net
USERNAME=ahbozhenadmin
PASSWORD=Aa123456
```

`PAGE_SIZE` (default: `100`) can be adjusted directly in `gunsun_export.py` if needed.

---

## Usage

```bash
# Full export (all records)
/Users/I306969/Development/HFBZ/.venv/bin/python gunsun_export.py

# Quick test — fetches first 10 records only
python gunsun_export.py --test
```

Output file is written to the current directory:

```
gunsun_asset_accounts_YYYYMMDD_HHMMSS.xlsx
```

---

## Authentication Flow

The site uses a non-standard auth mechanism — not a simple cookie login:

1. `GET /api/auth/config/PASSWORD_PUBLIC_KEY` — fetch RSA public key
2. Encrypt password with **RSA PKCS1 v1.5** using the public key
3. `POST /api/auth/authentication/login` — returns a `session-id` UUID in the **response header** (not a cookie)
4. `POST /api/auth/system/choose-system` — select the `robin` subsystem
5. All subsequent requests include `Session-Id: <uuid>` as a request header

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/auth/config/PASSWORD_PUBLIC_KEY` | Fetch RSA public key for password encryption |
| `POST` | `/api/auth/authentication/login` | Login, returns `session-id` header |
| `POST` | `/api/auth/system/choose-system` | Select `robin` subsystem |
| `GET` | `/api/robin/asset-account/resultCount` | Portfolio summary statistics |
| `GET` | `/api/robin/asset-account` | Paginated asset account list |
| `GET` | `/api/robin/asset-account/open` | Debtor detail including mobile number (batch, up to 100 per call) |

---

## Output Columns (Asset Accounts sheet)

Key columns exported from the API:

| Column | Description |
|---|---|
| `id` | Internal record ID |
| `debtorNo` | Debtor identifier (hashed) |
| `name` | Debtor name |
| `identityNo` | ID card number |
| `mobile` | Mobile phone number (from `/open` endpoint) |
| `loansOrganization` | Lending institution |
| `projectName` | Collection project name |
| `overdueDays` | Days overdue |
| `toCollectAmount` | Outstanding amount to collect |
| `remainingPrincipal` | Remaining principal |
| `commissionAmount` | Commission amount |
| `commissionStartTime` | Commission period start |
| `commissionEndTime` | Commission period end |
| `lastFollowTime` | Last collection follow-up time |
| `collecterNickName` | Assigned collector |
| `debtorLabel` | Debtor classification label |
| `collectionAction` | Current collection action status |

---

## Notes

- Sessions expire after a period of inactivity; the script re-authenticates on each run
- Mobile numbers are fetched via a separate batch request (`/open`) using `debtorNo` + `projectCode` as keys
- The `JSESSIONID` cookie visible in browser DevTools is set by the backend but not required for API calls — the `Session-Id` header is the actual auth token
