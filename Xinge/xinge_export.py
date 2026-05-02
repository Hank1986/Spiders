#!/usr/bin/env python3
import argparse
import os
import sys
import time
from typing import Dict, Any, List, Tuple
import json
from datetime import datetime
import requests
import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from concurrent.futures import ThreadPoolExecutor, as_completed

LOGIN_URL = "https://server.xingeguanli.com/osapi/Login/Loginact"
CASE_LIST_URL = "https://server.xingeguanli.com/osapi/Cases/index"
CASE_INFO_URL = "https://server.xingeguanli.com/osapi/Cases/caseInfo"

class ApiError(Exception):
    pass

@retry(reraise=True,
       stop=stop_after_attempt(3),
       wait=wait_exponential(multiplier=1, min=1, max=8),
       retry=retry_if_exception_type((requests.RequestException, ApiError)))
def login(username: str, password: str) -> str:
    payload = {"username": username, "password": password}
    resp = requests.post(LOGIN_URL, json=payload, timeout=15)
    if resp.status_code != 200:
        raise ApiError(f"Login failed status={resp.status_code} body={resp.text[:200]}")
    data = resp.json()
    token = data.get("token") or data.get("data", {}).get("token")
    if not token:
        raise ApiError("Token not found in response")
    return token

@retry(reraise=True,
       stop=stop_after_attempt(3),
       wait=wait_exponential(multiplier=1, min=1, max=8),
       retry=retry_if_exception_type((requests.RequestException, ApiError)))
def fetch_case_list(token: str, page: int, per_page: int, status: int) -> Tuple[List[Dict[str, Any]], int, int]:
    """Fetch a page of cases.
    Returns (list_of_records, total_pages, total_count).
    """
    headers = {"Token": token}
    params = {
        "page": page,
        "perPage": per_page,
        "sortstatus": "",
        "sorttype": "",
        "status": status,
        "snatch_id": "",
        "is_settle": ""
    }
    resp = requests.get(CASE_LIST_URL, headers=headers, params=params, timeout=30)
    if resp.status_code != 200:
        raise ApiError(f"Case list failed status={resp.status_code} body={resp.text[:200]}")
    root = resp.json()
    data_obj = root.get("data", {})
    # API structure: { code, msg, data: { page, pages, count, perPage, data: [records] } }
    total_pages = int(data_obj.get("pages", 1))
    total_count = int(data_obj.get("count", 0))
    records = data_obj.get("data", [])
    if not isinstance(records, list):
        raise ApiError("Unexpected case list structure: records not list")
    return records, total_pages, total_count

@retry(reraise=True,
       stop=stop_after_attempt(3),
       wait=wait_exponential(multiplier=1, min=1, max=8),
       retry=retry_if_exception_type((requests.RequestException, ApiError)))
def fetch_case_detail(token: str, case_id: Any) -> Dict[str, Any]:
    headers = {"Token": token}
    params = {"case_id": case_id}
    resp = requests.get(CASE_INFO_URL, headers=headers, params=params, timeout=20)
    if resp.status_code != 200:
        raise ApiError(f"Case detail failed id={case_id} status={resp.status_code} body={resp.text[:200]}")
    data = resp.json()
    detail = data.get("data") or data
    if not isinstance(detail, dict):
        raise ApiError("Unexpected case detail structure")
    detail["case_id"] = case_id
    return detail


def flatten_detail(detail: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten top-level fields and JSON-stringify nested objects/arrays.
    Ensures export captures all data objects returned by details API.
    """
    flat: Dict[str, Any] = {}
    for k, v in detail.items():
        if isinstance(v, (dict, list)):
            # Preserve full nested structure in JSON form
            flat[k] = json.dumps(v, ensure_ascii=False)
        else:
            flat[k] = v
    return flat


def main():
    parser = argparse.ArgumentParser(description="Export Xinge case details to Excel")
    parser.add_argument("--username", default=os.getenv("XINGE_USERNAME"), help="Login username")
    parser.add_argument("--password", default=os.getenv("XINGE_PASSWORD"), help="Login password")
    parser.add_argument("--status", type=int, default=0, help="Status filter (default 0)")
    parser.add_argument("--pages", type=int, default=1, help="Number of pages to fetch starting at 1 (ignored if --all)")
    parser.add_argument("--per-page", type=int, default=10, help="Items per page (API may allow larger e.g. 100)")
    parser.add_argument("--all", action="store_true", help="Fetch all pages automatically")
    parser.add_argument("--out", default="case_details.xlsx", help="Output Excel file path")
    parser.add_argument("--sleep", type=float, default=0.0, help="Sleep seconds between detail requests (unused in parallel)")
    parser.add_argument("--workers", type=int, default=8, help="Number of parallel workers for fetching details")
    parser.add_argument("--raw-json-columns", action="store_true", help="Also write a separate JSON file with raw details per case")
    parser.add_argument("--raw-json-only-data", action="store_true", help="When writing raw JSON, export only the 'data' field from API response if present")
    parser.add_argument("--raw-json-index", type=int, default=None, help="If set with --raw-json-columns, write only the Nth object (1-based index) to a separate file")
    parser.add_argument("--single-data-index", type=int, default=None, help="If set, save only that detail object's 'data' dict to Case_Details_{Datetime}.xlsx")
    parser.add_argument("--all-data-excel", type=str, default=None, help="If set, write all detail 'data' objects to the specified Excel filename")
    args = parser.parse_args()

    if not args.username or not args.password:
        print("Username/password required", file=sys.stderr)
        sys.exit(2)

    print("Logging in...")
    try:
        token = login(args.username, args.password)
    except Exception as e:
        print(f"Login error: {e}", file=sys.stderr)
        sys.exit(1)
    print("Token acquired")

    all_case_ids: List[Any] = []

    # Fetch first page to discover total
    try:
        first_records, total_pages, total_count = fetch_case_list(token, 1, args.per_page, args.status)
    except Exception as e:
        print(f"Failed to fetch first page: {e}", file=sys.stderr)
        sys.exit(1)

    target_pages = total_pages if args.all else min(args.pages, total_pages)
    print(f"Total pages reported: {total_pages}, total records: {total_count}. Will fetch: {target_pages} page(s).")

    def collect(records: List[Dict[str, Any]]):
        for r in records:
            cid = r.get("case_id") or r.get("id") or r.get("caseId")
            if cid is None:
                continue
            if cid not in all_case_ids:
                all_case_ids.append(cid)

    collect(first_records)
    print(f"Page 1: got {len(first_records)} records; unique cases so far: {len(all_case_ids)}")

    for page in range(2, target_pages + 1):
        print(f"Fetching case list page {page}...")
        try:
            records, _, _ = fetch_case_list(token, page, args.per_page, args.status)
        except Exception as e:
            print(f"Failed to fetch page {page}: {e}")
            continue
        collect(records)
        pct = (len(all_case_ids) / total_count * 100) if total_count else 0
        print(f"Page {page}: got {len(records)} records; unique cases: {len(all_case_ids)} ({pct:.2f}% of reported total)")
        # Early stop if we already have all
        if total_count and len(all_case_ids) >= total_count:
            print("Collected all reported records early; stopping page fetch.")
            break

    if args.all and len(all_case_ids) < total_count:
        print(f"Warning: collected {len(all_case_ids)} < reported {total_count}. Some records may have been skipped.")

    print(f"Fetching details for {len(all_case_ids)} cases in parallel with workers={args.workers}...")

    details: List[Dict[str, Any]] = []
    raw_details: List[Dict[str, Any]] = []

    def task(cid: Any) -> Tuple[Any, Dict[str, Any]]:
        d = fetch_case_detail(token, cid)
        return cid, d

    errors = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(task, cid): cid for cid in all_case_ids}
        for i, future in enumerate(as_completed(futures), start=1):
            cid = futures[future]
            try:
                _, d = future.result()
                raw_details.append(d)
                details.append(flatten_detail(d))
            except Exception as e:
                errors += 1
                print(f"Detail failed for {cid}: {e}")
            if i % 50 == 0:
                print(f"Progress: {i}/{len(all_case_ids)} details fetched; errors={errors}")

    if not details:
        print("No details fetched, exiting")
        sys.exit(3)

    print(f"Writing {len(details)} case details to {args.out}")
    df = pd.DataFrame(details)
    cols = ["case_id"] + [c for c in df.columns if c != "case_id"]
    df = df[cols]
    df.to_excel(args.out, index=False)

    if args.raw_json_columns:
        base = os.path.splitext(args.out)[0]
        json_out = base + "_raw.json"
        # If only exporting the Nth object and only its 'data' field
        if args.raw_json_index is not None:
            idx = args.raw_json_index
            if idx < 1 or idx > len(raw_details):
                print(f"Requested raw index {idx} out of range (1..{len(raw_details)})")
            else:
                obj = raw_details[idx - 1]
                to_write = obj.get("data", obj) if args.raw_json_only_data else obj
                one_out = base + f"_raw_{idx}_data.json" if args.raw_json_only_data else base + f"_raw_{idx}.json"
                with open(one_out, "w", encoding="utf-8") as f:
                    f.write(json.dumps(to_write, ensure_ascii=False, indent=2))
                print(f"Raw object #{idx} written to {one_out}")
        # Write all as JSON lines
        with open(json_out, "w", encoding="utf-8") as f:
            for obj in raw_details:
                payload = obj.get("data", obj) if args.raw_json_only_data else obj
                f.write(json.dumps(payload, ensure_ascii=False))
                f.write("\n")
        print(f"Raw details written to {json_out}")

    # After writing combined Excel and optional raw JSON
    # Insert single detail export if requested
    if args.single_data_index is not None:
        idx = args.single_data_index
        if idx < 1 or idx > len(raw_details):
            print(f"single-data-index {idx} out of range (1..{len(raw_details)})")
        else:
            obj = raw_details[idx - 1]
            data_dict = obj.get("data", obj)
            # Flatten nested structures for columns
            flat = {}
            for k, v in data_dict.items():
                if isinstance(v, (dict, list)):
                    flat[k] = json.dumps(v, ensure_ascii=False)
                else:
                    flat[k] = v
            df_single = pd.DataFrame([flat])
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            single_path = f"Case_Details_{ts}.xlsx"
            df_single.to_excel(single_path, index=False)
            print(f"Single detail object's data written to {single_path}")

    # Export all detail 'data' objects to given Excel if requested
    if args.all_data_excel:
        rows: List[Dict[str, Any]] = []
        for obj in raw_details:
            data_dict = obj.get("data", obj)
            flat = {}
            for k, v in data_dict.items():
                if isinstance(v, (dict, list)):
                    flat[k] = json.dumps(v, ensure_ascii=False)
                else:
                    flat[k] = v
            rows.append(flat)
        if rows:
            df_all = pd.DataFrame(rows)
            # Ensure case_id first if present
            cols = ["case_id"] + [c for c in df_all.columns if c != "case_id"] if "case_id" in df_all.columns else list(df_all.columns)
            df_all = df_all[cols]
            df_all.to_excel(args.all_data_excel, index=False)
            print(f"All detail 'data' objects written to {args.all_data_excel}")
        else:
            print("No detail data rows to export for all-data-excel")

    print("Done.")

if __name__ == "__main__":
    main()
