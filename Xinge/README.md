# Xinge Case Exporter

Script flow:
1. Login to obtain Token using username/password.
2. Fetch paginated case list.
3. For each case_id fetch full case details.
4. Export combined dataset to an Excel file (`case_details.xlsx`).

## Usage
```bash
pip install -r requirements.txt
python xinge_export.py --username hfbozhen --password Aa123456 --status 0 --pages 1 --per-page 10 --out case_details.xlsx
```

Arguments:
- `--username` / `--password` : Credentials for login.
- `--status` : Status filter (default 0).
- `--pages` : Number of pages to fetch starting from page 1.
- `--per-page` : Page size (default 10).
- `--out` : Output Excel path.
- `--sleep` : Seconds to sleep between detail requests (default 0.2).

Environment variable override (optional):
- `XINGE_USERNAME`, `XINGE_PASSWORD` if flags omitted.

## Notes
- Adds header `Token: <token>` per API spec.
- Basic retry logic on network errors and HTTP 5xx.
- Handles duplicate case_ids gracefully.
