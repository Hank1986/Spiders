# HanShuo — Case List Exporter

Exports all case records from the HanShuo admin system to an Excel file.

## Requirements

- Python 3.10+
- Dependencies: `requests`, `openpyxl`, `python-dotenv`, `pycryptodome`

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Configure credentials in `.env`:
   ```
   USERNAME=bozhen
   PASSWORD=123456
   ORG_ID=47
   ```

## Usage

```bash
python3.10 main.py
```

Output file: `hanshuo_cases_YYYYMMDD_HHMMSS.xlsx`

## How It Works

1. **Auth** — POSTs to `/api/admin/oauth2/token` with AES-CFB encrypted password (key: `loanloanloanloan`) and Basic auth `org:org`. Returns a Bearer token.
2. **Fetch** — POSTs to `/api/admin/org/case/list` with pagination (100 records/page) until all records are retrieved.
3. **Export** — Writes all records to Excel with Chinese column headers and auto-fitted column widths.

## Excel Columns

| Field | 中文名 |
|---|---|
| caseNo | 案件编号 |
| caseStatusText | 案件状态 |
| productName | 产品名称 |
| userName | 借款人姓名 |
| idno | 身份证号 |
| userPhone | 手机号 |
| handleAmount | 委案金额 |
| caseAlreadyRepaidAmount | 已还金额 |
| toBeRepaidHandleAmount | 待还委案金额 |
| residueAmount | 剩余金额 |
| loanPactNo | 借款合同号 |
| orgTitle | 机构名称 |
| entrustTime | 委案时间 |
| distTime | 分配时间 |
| cpeName | 催收员 |
| followStatusText | 跟进状态 |
| entrustFollowTimes | 委案跟进次数 |
| entrustLastFollowTime | 最后跟进时间 |
