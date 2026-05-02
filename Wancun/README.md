# Wancun Data Export

Script to export customer details from Wancun APIs to an Excel file.

- URL: http://120.55.38.129:9999/#/login
- Org IDs: `133253`, `886979`

---

## Quick Start (recommended)

`login_and_export.py` handles the full pipeline automatically:
login → CAPTCHA recognition → token → export.

### macOS / Linux

```bash
# Prerequisites (one-time setup)
ollama pull minicpm-v
.venv/bin/pip install -r requirements.txt

# Export tenant 133253 (default)
.venv/bin/python login_and_export.py

# Export tenant 886979
.venv/bin/python login_and_export.py --tenant 886979

# All options
.venv/bin/python login_and_export.py \
  --tenant 886979 \
  --user admin \
  --password Aa123456@ \
  --workers 16 \
  --out /path/to/output.xlsx
```

### Windows Server (PowerShell)

```powershell
# Prerequisites (one-time setup)
ollama pull minicpm-v

# Create venv and install packages
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt

# Export tenant 133253 (default)
.venv\Scripts\python login_and_export.py

# Export tenant 886979
.venv\Scripts\python login_and_export.py --tenant 886979

# All options
.venv\Scripts\python login_and_export.py `
  --tenant 886979 `
  --user admin `
  --password Aa123456@ `
  --workers 16 `
  --out C:\exports\output.xlsx
```

Output files are named `wancun_<tenant>_<YYYYMMDD_HHMMSS>.xlsx` by default,
so exports from different orgs are always distinguishable.

### Environment variables (alternative to CLI args)

| Variable | Default | macOS/Linux | Windows (PowerShell) |
|---|---|---|---|
| `WANCUN_TENANT` | `133253` | `export WANCUN_TENANT=886979` | `$env:WANCUN_TENANT="886979"` |
| `WANCUN_USER` | `admin` | `export WANCUN_USER=admin` | `$env:WANCUN_USER="admin"` |
| `WANCUN_PASSWORD` | `Aa123456@` | `export WANCUN_PASSWORD=Aa123456@` | `$env:WANCUN_PASSWORD="Aa123456@"` |
| `WANCUN_OUT` | `wancun_<tenant>_<timestamp>.xlsx` | `export WANCUN_OUT=out.xlsx` | `$env:WANCUN_OUT="out.xlsx"` |
| `OLLAMA_VISION_MODEL` | `minicpm-v` | `export OLLAMA_VISION_MODEL=llava:7b` | `$env:OLLAMA_VISION_MODEL="llava:7b"` |

---

## Manual export (token already known)

If you already have a bearer token, run `wancun_export.py` directly.

**macOS / Linux:**
```bash
.venv/bin/python wancun_export.py \
  --all \
  --workers 8 \
  --out customers_886979_20260501.xlsx \
  --token "eyJ0eXAiOiJKc29uV2..."
```

**Windows (PowerShell):**
```powershell
.venv\Scripts\python wancun_export.py `
  --all `
  --workers 8 `
  --out customers_886979_20260501.xlsx `
  --token "eyJ0eXAiOiJKc29uV2..."
```

Or pass the token via environment variable:

```bash
# macOS / Linux
export WANCUN_TOKEN="eyJ0eXAiOiJKc29uV2..."
.venv/bin/python wancun_export.py --all --out output.xlsx
```

```powershell
# Windows
$env:WANCUN_TOKEN="eyJ0eXAiOiJKc29uV2..."
.venv\Scripts\python wancun_export.py --all --out output.xlsx
```

---

## Setup

Requires Python 3.9+ and [Ollama](https://ollama.com) with a vision model installed.

| Step | Command |
|---|---|
| Install Ollama | See https://ollama.com |
| Pull vision model | `ollama pull minicpm-v` |
| Install packages | `.venv/bin/pip install -r requirements.txt` (or `.venv\Scripts\pip install -r requirements.txt` on Windows) |

Make sure Ollama is running (`ollama serve` or the desktop app) before running the script.

Packages: `requests`, `pandas`, `tenacity`, `openpyxl`, `openai`
