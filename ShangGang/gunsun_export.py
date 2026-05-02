"""
gunsun_export.py
----------------
Logs in to ams.gunsun.net, fetches all asset-account records
via pagination, and saves them to an Excel file.

Auth: login returns a `session-id` response header used on all subsequent requests.

Usage:
    python gunsun_export.py           # full export
    python gunsun_export.py --test    # first 10 records only

Dependencies: requests, pycryptodome, pandas, openpyxl, python-dotenv
"""

import argparse
import base64
import json
import math
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import pandas as pd
import requests
from Crypto.Cipher import PKCS1_v1_5
from Crypto.PublicKey import RSA
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.environ["BASE_URL"]
USERNAME = os.environ["USERNAME"]
PASSWORD = os.environ["PASSWORD"]
PAGE_SIZE = 100


def login(session: requests.Session) -> str:
    """Login and inject Session-Id into session headers. Returns session-id."""
    # Step 1: fetch RSA public key
    resp = session.get(f"{BASE_URL}/api/auth/config/PASSWORD_PUBLIC_KEY")
    resp.raise_for_status()
    pub_key_b64 = resp.json()["data"]

    # Step 2: RSA-encrypt the password
    key_der = base64.b64decode(pub_key_b64)
    rsa_key = RSA.import_key(key_der)
    cipher = PKCS1_v1_5.new(rsa_key)
    encrypted_pwd = base64.b64encode(cipher.encrypt(PASSWORD.encode())).decode()

    # Step 3: POST login
    resp = session.post(
        f"{BASE_URL}/api/auth/authentication/login",
        json={"username": USERNAME, "password": encrypted_pwd},
        headers={"Content-Type": "application/json;charset=utf-8"},
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"Login failed: {body.get('msg')}")

    session_id = resp.headers.get("session-id")
    if not session_id:
        raise RuntimeError("session-id header not found in login response")

    # Inject into all future requests
    session.headers.update({"Session-Id": session_id})

    # Step 4: choose system (robin)
    session.post(
        f"{BASE_URL}/api/auth/system/choose-system",
        json={"systemType": "robin"},
        headers={"Content-Type": "application/json;charset=utf-8"},
    )

    print(f"[+] Logged in. Session-Id={session_id}")
    return session_id


def fetch_summary(session: requests.Session) -> dict:
    resp = session.get(
        f"{BASE_URL}/api/robin/asset-account/resultCount",
        params={"current": 1, "pageSize": PAGE_SIZE, "page": 1},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("data", {})


def fetch_page(session: requests.Session, page: int) -> tuple[list, int]:
    """Returns (records, total)."""
    resp = session.get(
        f"{BASE_URL}/api/robin/asset-account",
        params={"current": page, "pageSize": PAGE_SIZE, "page": page},
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    total = int(body.get("total") or 0)
    data = body.get("data", [])
    if isinstance(data, list):
        return data, total
    # fallback: numeric-keyed dict
    if isinstance(data, dict):
        return [data[str(i)] for i in range(len(data)) if str(i) in data], total
    return [], total


def fetch_mobile_details(session: requests.Session, records: list[dict]) -> dict:
    """Batch-fetch /open endpoint for a list of records. Returns {debtorNo: mobile}."""
    debtor_list = json.dumps([
        {"debtorNo": r["debtorNo"], "projectCode": r["projectCode"]}
        for r in records
    ], separators=(",", ":"))
    resp = session.get(
        f"{BASE_URL}/api/robin/asset-account/open",
        params={"debtorList": debtor_list},
        timeout=60,
    )
    resp.raise_for_status()
    details = resp.json().get("data", []) or []
    return {d["debtorNo"]: d.get("mobile") for d in details}


def fetch_all_records(session: requests.Session, test_mode: bool = False) -> tuple[list[dict], dict]:
    summary = fetch_summary(session)
    print(f"[+] Summary:")
    print(f"    caseCount          : {summary.get('caseCount')}")
    print(f"    debtorCount        : {summary.get('debtorCount')}")
    print(f"    toCollectAmountSum : {summary.get('toCollectAmountSum')}")
    print(f"    remainingPrincipal : {summary.get('remainingPrincipalSum')}")

    if test_mode:
        print("[!] TEST MODE: fetching first 10 records only")
        records, _ = fetch_page(session, 1)
        all_records = records[:10]
    else:
        first_page, total = fetch_page(session, 1)
        total_pages = max(1, math.ceil(total / PAGE_SIZE))
        print(f"[+] Total records: {total}, pages: {total_pages}")
        all_records = list(first_page)
        print(f"    Page 1/{total_pages}: {len(first_page)} records")
        for page in range(2, total_pages + 1):
            records, _ = fetch_page(session, page)
            if not records:
                print(f"    Page {page}: empty, stopping.")
                break
            all_records.extend(records)
            print(f"    Page {page}/{total_pages}: {len(records)} records (total: {len(all_records)})")

    # Enrich with mobile numbers via /open endpoint (10 per batch, 5 threads)
    print(f"[+] Fetching mobile numbers for {len(all_records)} records...")
    batches = [all_records[i:i + 10] for i in range(0, len(all_records), 10)]
    mobile_map = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_mobile_details, session, batch): idx
                   for idx, batch in enumerate(batches)}
        for future in as_completed(futures):
            try:
                mobile_map.update(future.result())
            except requests.exceptions.ReadTimeout:
                print(f"\n    [!] Timeout on batch {futures[future]}, mobile numbers skipped for that batch.")
            done = sum(1 for f in futures if f.done())
            print(f"    Batches done: {done}/{len(batches)}", end="\r")
    print()
    for r in all_records:
        r["mobile"] = mobile_map.get(r["debtorNo"])

    return all_records, summary


def save_to_excel(records: list[dict], summary: dict, output_path: str):
    df = pd.DataFrame(records)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Asset Accounts", index=False)
        pd.DataFrame([summary]).to_excel(writer, sheet_name="Summary", index=False)

    print(f"[+] Saved {len(records)} records → {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Export asset accounts from ams.gunsun.net")
    parser.add_argument("--test", action="store_true", default=False,
                        help="Fetch first 10 records only (for testing)")
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update({
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9,zh;q=0.8",
        "Referer": f"{BASE_URL}/robin/asset/ledger",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/146.0.0.0 Safari/537.36"
        ),
    })

    login(session)
    records, summary = fetch_all_records(session, test_mode=args.test)

    if not records:
        print("[-] No records fetched.")
        return

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = f"gunsun_asset_accounts_{timestamp}.xlsx"
    save_to_excel(records, summary, output_path)


if __name__ == "__main__":
    main()
