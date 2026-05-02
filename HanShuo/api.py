import os
import math
import requests
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from Crypto.Cipher import AES
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://116.62.150.123:8443"
USERNAME = os.getenv("USERNAME")
PASSWORD = os.getenv("PASSWORD")
PWD_ENC_KEY = b"loanloanloanloan"


def encrypt_password(password: str) -> str:
    key = PWD_ENC_KEY
    cipher = AES.new(key, AES.MODE_CFB, iv=key, segment_size=128)
    encrypted = cipher.encrypt(password.encode())
    return base64.b64encode(encrypted).decode()


def get_token() -> str:
    url = f"{BASE_URL}/api/admin/oauth2/token"
    params = {
        "username": USERNAME,
        "randomStr": "blockPuzzle",
        "code": "",
        "grant_type": "password",
        "scope": "server",
    }
    credentials = base64.b64encode(b"org:org").decode()
    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
        "TENANT-ID": "2",
    }
    encrypted_pwd = encrypt_password(PASSWORD)
    body = f"password={encrypted_pwd}"
    resp = requests.post(url, params=params, data=body, headers=headers, verify=False)
    resp.raise_for_status()
    data = resp.json()
    token = data.get("access_token") or data.get("data", {}).get("access_token")
    if not token:
        raise ValueError(f"Token not found in response: {data}")
    return token


def fetch_case_list(token: str, org_id: int, page: int, size: int = 100) -> dict:
    url = f"{BASE_URL}/api/admin/org/case/list"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json;charset=UTF-8",
        "TENANT-ID": "2",
    }
    payload = {
        "productId": None,
        "userName": None,
        "caseNo": None,
        "idno": None,
        "userPhone": None,
        "regAddrList": [],
        "refundStatus": None,
        "followStatusId": None,
        "caseStatus": None,
        "tagTempNameList": [],
        "isTagAlter": None,
        "isSensitive": None,
        "isHistoryComplaint": None,
        "isHaveLawsuitOrder": None,
        "rebuildStatus": None,
        "departmentIdList": [],
        "isFollow": None,
        "entrustContactResultIdList": [],
        "caseUserUniqueId": None,
        "cpeId": None,
        "isRetain": None,
        "orgId": org_id,
        "current": page,
        "size": size,
    }
    resp = requests.post(url, json=payload, headers=headers, verify=False)
    resp.raise_for_status()
    return resp.json()


def fetch_all_records(token: str, org_id: int, page_size: int = 100, max_workers: int = 8) -> list:
    # Fetch first page to get total count
    print("Fetching page 1 (probing total)...")
    first = fetch_case_list(token, org_id, 1, page_size)
    if first.get("code") != 0:
        raise ValueError(f"API error on page 1: {first.get('msg')}")
    total = first["data"].get("total", 0)
    first_records = first["data"]["records"]
    print(f"  Got {len(first_records)} records (total: {total})")

    if not first_records or total <= page_size:
        return first_records

    total_pages = math.ceil(total / page_size)
    remaining_pages = range(2, total_pages + 1)

    results = {1: first_records}

    def fetch_page(page):
        print(f"Fetching page {page}...")
        result = fetch_case_list(token, org_id, page, page_size)
        if result.get("code") != 0:
            raise ValueError(f"API error on page {page}: {result.get('msg')}")
        records = result["data"]["records"]
        print(f"  Page {page}: got {len(records)} records")
        return page, records

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_page, p): p for p in remaining_pages}
        for future in as_completed(futures):
            page, records = future.result()
            results[page] = records

    all_records = []
    for page in sorted(results):
        all_records.extend(results[page])
    print(f"Total records fetched: {len(all_records)}/{total}")
    return all_records
