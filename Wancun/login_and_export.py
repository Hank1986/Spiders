#!/usr/bin/env python3
"""
Wancun full pipeline
====================
1. Login with org ID, username, password
2. Recognise the verification code (Ollama vision model)
3. Get access token via BladeX OAuth API
4. Run wancun_export.py --all to export customer data

Usage
-----
# defaults (tenant 133253, admin / Aa123456@)
.venv/bin/python login_and_export.py

# override any credential or org ID
.venv/bin/python login_and_export.py --tenant 886979 --user admin --password Aa123456@

# custom output path and worker count
.venv/bin/python login_and_export.py --out /tmp/export.xlsx --workers 16

Environment variables (all optional, CLI args take precedence):
  WANCUN_TENANT         org/tenant ID         (default: 133253)
  WANCUN_USER           username              (default: admin)
  WANCUN_PASSWORD       password              (default: Aa123456@)
  WANCUN_OUT            output xlsx path      (default: wancun_<tenant>_<timestamp>.xlsx)
  OLLAMA_VISION_MODEL   Ollama model name    (default: minicpm-v)

Prerequisites
-------------
  ollama pull minicpm-v
  .venv/bin/pip install openai
"""

import argparse
import base64
import json
import os
import random
import re
import string
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Tuple

import requests
from Crypto.Cipher import AES, PKCS1_v1_5
from Crypto.PublicKey import RSA
from Crypto.Util.Padding import pad

SCRIPT_DIR = Path(__file__).parent
BASE_URL = "http://120.55.38.129:9999"

# OAuth2 client credentials (from frontend JS: saber / wclw_sercet)
_CLIENT_ID     = "saber"
_CLIENT_SECRET = "wclw_sercet"
_BASIC_AUTH    = base64.b64encode(
    f"{_CLIENT_ID}:{_CLIENT_SECRET}".encode()
).decode()

# RSA public key embedded in the frontend JS for encrypting the AES key
_RSA_PUBKEY_B64 = (
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCE66++2AZIZhbvwWcN+YqpNb8v"
    "X6R+hp9HiM/jwJjYGIC0tQbuWdeeh4FUHhKly65bxK0ysASzH2rvuRnWURPXc9rC"
    "ZqTbD7gPYWK/FaTjRtNku0Xlg4BeWvOsoIGNkWKZxrOH7fKcaG4FZtvekDyVINOM"
    "67h1yAM1vX6/cnn7swIDAQAB"
)

# ── defaults (env overrides, then CLI args override env) ─────────────────────
DEFAULT_TENANT   = os.getenv("WANCUN_TENANT",   "133253")
DEFAULT_USER     = os.getenv("WANCUN_USER",     "admin")
DEFAULT_PASSWORD = os.getenv("WANCUN_PASSWORD", "Aa123456@")
MAX_RETRIES      = 10


class LoginError(Exception):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# AES + RSA encryption (matches the frontend crypto module)
# ─────────────────────────────────────────────────────────────────────────────

def _gen_aes_key(length: int = 16) -> str:
    """Generate a random alphanumeric key (mirrors the frontend's genKey)."""
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def _aes_encrypt(plaintext: str, key: str) -> str:
    """
    AES-ECB encrypt with PKCS7 padding, return base64-encoded ciphertext.
    Mirrors the frontend's CryptoJS.AES.encrypt(..., {mode: ECB, padding: Pkcs7}).
    """
    cipher = AES.new(key.encode("utf-8"), AES.MODE_ECB)
    padded = pad(plaintext.encode("utf-8"), AES.block_size)
    ciphertext = cipher.encrypt(padded)
    return base64.b64encode(ciphertext).decode("utf-8")


def _rsa_encrypt(plaintext: str, pubkey_b64: str) -> str:
    """
    RSA encrypt with PKCS1v1.5 padding, return base64-encoded ciphertext.
    Mirrors the frontend's JSEncrypt.encrypt() which outputs Base64.

    IMPORTANT: The frontend's o.encrypt() calls JSON.stringify() on the
    plaintext before encryption, so we must do the same here.
    """
    # JSON.stringify the plaintext — adds surrounding quotes: "key" → '"key"'
    jsonified = json.dumps(plaintext)
    der = base64.b64decode(pubkey_b64)
    pubkey = RSA.import_key(der)
    cipher = PKCS1_v1_5.new(pubkey)
    ciphertext = cipher.encrypt(jsonified.encode("utf-8"))
    return base64.b64encode(ciphertext).decode("utf-8")


def encrypt_payload(data: dict) -> dict:
    """
    Encrypt a login payload the same way the frontend does:
      1. Generate a random 16-char AES key
      2. AES-ECB encrypt the JSON-serialised data with that key → base64
      3. RSA encrypt the AES key (JSON-stringified) with the embedded public key → base64
      4. Return {"data": "<aes-ciphertext>", "aesKey": "<rsa-ciphertext>"}
    """
    aes_key = _gen_aes_key()
    json_str = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    encrypted_data = _aes_encrypt(json_str, aes_key)
    encrypted_key = _rsa_encrypt(aes_key, _RSA_PUBKEY_B64)
    return {"data": encrypted_data, "aesKey": encrypted_key}


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 – fetch CAPTCHA image from the API
# ─────────────────────────────────────────────────────────────────────────────

def fetch_captcha() -> Tuple[str, bytes]:
    """
    GET /api/blade-auth/oauth/captcha

    BladeX can return either:
      • JSON  {"key": "<uuid>", "image": "data:image/png;base64,<b64>"}
      • Raw   image bytes (Content-Type: image/png or image/jpeg)

    Returns (captcha_key, image_bytes).  key is "" when not present.
    """
    resp = requests.get(
        f"{BASE_URL}/api/blade-auth/oauth/captcha",
        timeout=10,
    )
    resp.raise_for_status()

    ct = resp.headers.get("Content-Type", "")
    if "json" in ct:
        data = resp.json()
        key = data.get("key", "")
        img_str = data.get("image", "")
        # strip optional data-URI prefix: "data:image/png;base64,<b64>"
        if "," in img_str:
            img_str = img_str.split(",", 1)[1]
        return key, base64.b64decode(img_str)
    else:
        # raw image — no key delivered separately
        return "", resp.content


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 – recognise CAPTCHA digits with Ollama vision model
# ─────────────────────────────────────────────────────────────────────────────

def recognize_captcha(img_bytes: bytes) -> str:
    """
    Recognise CAPTCHA digits using a local Ollama vision model.
    Sends the raw image bytes (base64-encoded) to the model and returns
    the recognised digit string.
    """
    from openai import OpenAI

    model = os.getenv("OLLAMA_VISION_MODEL", "minicpm-v")
    client = OpenAI(
        base_url="http://localhost:11434/v1",
        api_key="c1a007aaf9dd473b9d83a6570375935b.DMGxLyyBkpPo88LwqRx5sYYy",
    )

    b64_data = base64.b64encode(img_bytes).decode("utf-8")
    data_uri = f"data:image/png;base64,{b64_data}"

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": data_uri},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Recognize the 4-digit verification code in this image. "
                            "Return ONLY the 4 digits, nothing else."
                        ),
                    },
                ],
            }
        ],
        temperature=0.1,
        max_tokens=10,
    )

    text = response.choices[0].message.content.strip()
    digits = re.sub(r"\D", "", text)
    if not digits:
        raise RuntimeError(f"Vision model returned no digits: {text!r}")
    return digits


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 – call the token endpoint
# ─────────────────────────────────────────────────────────────────────────────

def do_login(
    tenant: str,
    username: str,
    password: str,
    captcha_key: str,
    captcha_code: str,
) -> str:
    """
    POST /api/blade-auth/oauth/token
    - The login payload is AES+RSA encrypted (matching the frontend crypto).
    - OAuth2 client sent as Authorization: Basic saber:wclw_sercet
    - CAPTCHA key/code sent as request headers (Captcha-Key / Captcha-Code)
    - Tenant-Id sent as request header
    Returns the raw access_token string on success.
    Raises LoginError on failure.
    """
    plain_payload = {
        "tenantId":   tenant,
        "username":   username,
        "password":   password,
        "grant_type": "captcha",
        "scope":      "all",
        "type":       "account",
    }
    encrypted_payload = encrypt_payload(plain_payload)
    headers = {
        "Authorization": f"Basic {_BASIC_AUTH}",
        "Captcha-Key":   captcha_key,
        "Captcha-Code":  captcha_code,
        "Tenant-Id":      tenant,
    }

    resp = requests.post(
        f"{BASE_URL}/api/blade-auth/oauth/token",
        json=encrypted_payload,
        headers=headers,
        timeout=15,
    )

    if resp.status_code != 200:
        raise LoginError(f"HTTP {resp.status_code}: {resp.text[:300]}")

    body = resp.json()
    # token may be at top-level or nested under "data"
    token = (
        body.get("access_token")
        or body.get("data", {}).get("access_token")
    )
    if not token:
        raise LoginError(f"No access_token in response: {json.dumps(body)[:300]}")

    return token


# ─────────────────────────────────────────────────────────────────────────────
# Retry wrapper
# ─────────────────────────────────────────────────────────────────────────────

def login_with_retry(
    tenant: str,
    username: str,
    password: str,
    max_attempts: int = MAX_RETRIES,
) -> str:
    """
    Fetch a fresh CAPTCHA, recognise it, and attempt login.
    Retries up to max_attempts times on any failure (wrong captcha,
    network blip, bad OCR).
    """
    last_error: Exception = RuntimeError("No attempts made")

    for attempt in range(1, max_attempts + 1):
        print(f"[{attempt}/{max_attempts}] Fetching CAPTCHA ...", flush=True)
        try:
            key, img_bytes = fetch_captcha()
            # Save first captcha for debugging
            if attempt == 1:
                with open("debug_captcha.png", "wb") as f:
                    f.write(img_bytes)
                print(f"  Saved debug_captcha.png ({len(img_bytes)} bytes)")
        except Exception as exc:
            print(f"  CAPTCHA fetch failed: {exc}")
            last_error = exc
            time.sleep(1)
            continue

        try:
            code = recognize_captcha(img_bytes)
        except Exception as exc:
            print(f"  CAPTCHA recognition failed: {exc}")
            last_error = exc
            time.sleep(1)
            continue
        print(f"  Recognised: {code!r}")

        if not re.fullmatch(r"\d{4}", code):
            print(f"  Recognition returned {code!r} (not 4 digits) — retrying ...")
            last_error = ValueError(f"Bad OCR result: {code!r}")
            time.sleep(0.5)
            continue

        try:
            token = do_login(tenant, username, password, key, code)
            print(f"  Login OK — token: {token[:40]}...")
            return token
        except LoginError as exc:
            print(f"  Login rejected: {exc}")
            last_error = exc
            time.sleep(1)

    raise RuntimeError(
        f"Failed to login after {max_attempts} attempts. "
        f"Last error: {last_error}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Step 4+5 – run wancun_export.py
# ─────────────────────────────────────────────────────────────────────────────

def run_export(token: str, out_file: str, workers: int = 8) -> None:
    """Invoke wancun_export.py inside the same venv."""
    # venv python path differs between Windows and Unix
    if sys.platform == "win32":
        python = str(SCRIPT_DIR / ".venv" / "Scripts" / "python.exe")
    else:
        python = str(SCRIPT_DIR / ".venv" / "bin" / "python")
    script = str(SCRIPT_DIR / "wancun_export.py")

    cmd = [
        python, script,
        "--all",
        "--workers", str(workers),
        "--out",     out_file,
        "--token",   token,
    ]
    print(f"\nRunning export → {out_file}", flush=True)
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(result.returncode)


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Login to Wancun system and export all customer data to Excel"
    )
    parser.add_argument(
        "--tenant", default=DEFAULT_TENANT,
        help=f"Org / tenant ID (default: {DEFAULT_TENANT})",
    )
    parser.add_argument(
        "--user", default=DEFAULT_USER,
        help=f"Username (default: {DEFAULT_USER})",
    )
    parser.add_argument(
        "--password", default=DEFAULT_PASSWORD,
        help="Password",
    )
    parser.add_argument(
        "--out", default=None,
        help="Output Excel file path (default: wancun_<tenant>_<timestamp>.xlsx)",
    )
    parser.add_argument(
        "--workers", type=int, default=8,
        help="Parallel workers for detail fetching (default: 8)",
    )
    args = parser.parse_args()

    out_file = args.out or (
        os.getenv("WANCUN_OUT")
        or f"wancun_{args.tenant}_{datetime.now():%Y%m%d_%H%M%S}.xlsx"
    )

    print(f"Tenant: {args.tenant}  User: {args.user}  Output: {out_file}")

    token = login_with_retry(args.tenant, args.user, args.password)
    run_export(token, out_file, workers=args.workers)


if __name__ == "__main__":
    main()
