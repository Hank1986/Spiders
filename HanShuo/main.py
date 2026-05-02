import os
import urllib3
from datetime import datetime
from dotenv import load_dotenv

from api import get_token, fetch_all_records
from exporter import export_to_excel

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()

ORG_ID = int(os.getenv("ORG_ID", 47))


def main():
    print("Authenticating...")
    token = get_token()
    print(f"Token obtained: {token[:20]}...")

    print(f"Fetching all case records for org {ORG_ID}...")
    records = fetch_all_records(token, org_id=ORG_ID)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"hanshuo_cases_{timestamp}.xlsx"
    export_to_excel(records, output_file)


if __name__ == "__main__":
    main()
