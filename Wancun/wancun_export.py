#!/usr/bin/env python3
import argparse
import os
import sys
import json
from typing import Dict, Any, List, Tuple
import requests
import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

LIST_URL = "http://120.55.38.129:9999/api/blade-system/baseCaseNew/customerList"
DETAIL_URL = "http://120.55.38.129:9999/api/blade-system/baseCaseNew/customerDetail"

class ApiError(Exception):
    pass

@retry(reraise=True,
       stop=stop_after_attempt(3),
       wait=wait_exponential(multiplier=1, min=1, max=8),
       retry=retry_if_exception_type((requests.RequestException, ApiError)))
def fetch_customer_page(token: str, page: int, size: int) -> Tuple[List[Dict[str, Any]], int, int]:
    """Fetch a page of customers. Returns (records, total_pages, total_count)."""
    headers = {"blade-auth": token}
    payload = {"current": page, "size": size}
    resp = requests.post(LIST_URL, json=payload, headers=headers, timeout=30)
    if resp.status_code != 200:
        raise ApiError(f"List failed status={resp.status_code} body={resp.text[:200]}")
    root = resp.json()
    data = root.get("data", {})
    records = data.get("records", [])
    total = int(data.get("total", 0))
    pages = int(data.get("pages", 1))
    if not isinstance(records, list):
        raise ApiError("records not list")
    return records, pages, total

@retry(reraise=True,
       stop=stop_after_attempt(3),
       wait=wait_exponential(multiplier=1, min=1, max=8),
       retry=retry_if_exception_type((requests.RequestException, ApiError)))
def fetch_customer_detail(token: str, cust_id: Any) -> Dict[str, Any]:
    headers = {"blade-auth": token}
    params = {"id": cust_id}
    resp = requests.get(DETAIL_URL, params=params, headers=headers, timeout=30)
    if resp.status_code != 200:
        raise ApiError(f"Detail failed id={cust_id} status={resp.status_code} body={resp.text[:200]}")
    root = resp.json()
    data = root.get("data", {})
    records = data.get("records")
    if isinstance(records, list) and records:
        detail = records[0]
    else:
        detail = data
    if not isinstance(detail, dict):
        raise ApiError("detail not dict")
    detail["id"] = cust_id
    return detail


def flatten(d: Dict[str, Any]) -> Dict[str, Any]:
    flat: Dict[str, Any] = {}
    for k, v in d.items():
        if isinstance(v, (dict, list)):
            flat[k] = json.dumps(v, ensure_ascii=False)
        else:
            flat[k] = v
    return flat


def main():
    parser = argparse.ArgumentParser(description="Export Wancun customer details to Excel")
    parser.add_argument("--token", default=os.getenv("WANCUN_TOKEN"), help="blade-auth token (bearer ...)" )
    parser.add_argument("--pages", type=int, default=1, help="Pages to fetch (ignored if --all)")
    parser.add_argument("--size", type=int, default=10, help="Page size")
    parser.add_argument("--all", action="store_true", help="Fetch all pages")
    parser.add_argument("--workers", type=int, default=8, help="Parallel workers for details")
    parser.add_argument("--out", default="wancun_customers.xlsx", help="Output Excel filename")
    parser.add_argument("--raw-json", action="store_true", help="Write raw JSON lines file of details")
    args = parser.parse_args()

    if not args.token:
        print("Token required via --token or WANCUN_TOKEN env", file=sys.stderr)
        sys.exit(2)

    token = args.token.strip()
    # Allow passing full 'bearer xxx' or just token string
    if not token.lower().startswith("bearer "):
        token = f"bearer {token}"

    print("Fetching first page...")
    try:
        first_records, total_pages, total_count = fetch_customer_page(token, 1, args.size)
    except Exception as e:
        print(f"First page error: {e}", file=sys.stderr)
        sys.exit(1)

    target_pages = total_pages if args.all else min(args.pages, total_pages)
    print(f"API reports pages={total_pages} total={total_count}; will fetch {target_pages} page(s)")

    ids: List[Any] = []
    def collect(recs: List[Dict[str, Any]]):
        for r in recs:
            cid = r.get("id")
            if cid and cid not in ids:
                ids.append(cid)

    collect(first_records)
    print(f"Page 1: {len(first_records)} records; unique ids={len(ids)}")

    for page in range(2, target_pages + 1):
        print(f"Fetching page {page}...")
        try:
            recs, _, _ = fetch_customer_page(token, page, args.size)
        except Exception as e:
            print(f"Page {page} failed: {e}")
            continue
        collect(recs)
        pct = (len(ids)/total_count*100) if total_count else 0
        print(f"Page {page}: {len(recs)} records; cumulative unique={len(ids)} ({pct:.2f}% of total)")
        if total_count and len(ids) >= total_count:
            print("Collected all reported records; stopping early")
            break

    if args.all and len(ids) < total_count:
        print(f"Warning: collected {len(ids)} < reported {total_count}")

    print(f"Fetching details for {len(ids)} customers with workers={args.workers}")
    details: List[Dict[str, Any]] = []
    raw: List[Dict[str, Any]] = []

    def task(cid: Any):
        d = fetch_customer_detail(token, cid)
        return cid, d

    errors = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = {ex.submit(task, cid): cid for cid in ids}
        for i, fut in enumerate(as_completed(futs), start=1):
            cid = futs[fut]
            try:
                _, d = fut.result()
                raw.append(d)
                details.append(flatten(d))
            except Exception as e:
                errors += 1
                print(f"Detail error id={cid}: {e}")
            if i % 50 == 0:
                print(f"Progress {i}/{len(ids)} errors={errors}")

    if not details:
        print("No details fetched", file=sys.stderr)
        sys.exit(3)

    df = pd.DataFrame(details)
    if "id" in df.columns:
        cols = ["id"] + [c for c in df.columns if c != "id"]
        df = df[cols]
    print(f"Writing {len(details)} details to {args.out}")
    df.to_excel(args.out, index=False)

    if args.raw_json:
        base = os.path.splitext(args.out)[0]
        raw_path = base + "_raw.jsonl"
        with open(raw_path, "w", encoding="utf-8") as f:
            for obj in raw:
                f.write(json.dumps(obj, ensure_ascii=False))
                f.write("\n")
        print(f"Raw JSON lines written to {raw_path}")

    print("Done.")

if __name__ == "__main__":
    main()
