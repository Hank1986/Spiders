// Export cases and details to Excel using existing axios helpers.
// This script is intended to run in a browser environment where localStorage and DOM are available.

import { get, post } from './axios.js';

// In browser, use global axios/XLSX provided by CDN; in Node, fallback to imports
// eslint-disable-next-line no-var
var axiosGlobal = (typeof window !== 'undefined' && window.axios) ? window.axios : undefined;
// eslint-disable-next-line no-var
var XLSXGlobal = (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : undefined;

// Helper getters
function getAxios() {
  return axiosGlobal ? axiosGlobal : requireAxios();
}
function getXLSX() {
  return XLSXGlobal ? XLSXGlobal : requireXLSX();
}

function requireAxios() {
  // Node ESM dynamic import fallback
  return (typeof window === 'undefined') ? (await import('axios')).default : window.axios;
}
function requireXLSX() {
  return (typeof window === 'undefined') ? (await import('xlsx')) : window.XLSX;
}

const BASE_URL = 'https://server.chengruizichan.com/osapi';
const LOGIN_ENDPOINT = '/Login/Loginact';
const CASES_LIST_ENDPOINT = '/Cases/index';
const CASE_INFO_ENDPOINT = '/Cases/caseInfo';

const LOGIN_CREDENTIALS = {
  username: 'hfbozhen',
  password: 'Aa123456',
};

let CASES_PER_PAGE = 50; // Adjust per need
let sessionToken = null; // Store token in memory

function buildUrl(path) {
  return `${BASE_URL}${path}`;
}

async function loginAndStoreToken() {
  console.log('Logging in...');
  const res = await post(buildUrl(LOGIN_ENDPOINT), LOGIN_CREDENTIALS);
  if (res?.data?.code !== 1) {
    throw new Error(`Login failed: ${res?.data?.msg || 'unknown error'}`);
  }
  const token = res?.data?.data?.token || res?.data?.token || res?.data?.data;
  if (!token) throw new Error('No token returned by login');
  sessionToken = token;
  // Save token to process environment for axios middleware
  try {
    if (typeof process !== 'undefined' && process.env) {
      process.env.TOKEN = String(token);
    }
  } catch {}
  console.log('Login successful. Token acquired.');
  return token;
}

function normalizeDecryptedData(data) {
  // If AES/Base64 decode returned bytes, convert to string
  if (data && (data instanceof Uint8Array || ArrayBuffer.isView(data))) {
    try {
      const decoder = new TextDecoder('utf-8');
      const str = decoder.decode(data);
      try {
        const json = JSON.parse(str);
        return json;
      } catch {
        return str;
      }
    } catch {
      return data;
    }
  }
  // If it's a string possibly containing JSON
  if (typeof data === 'string') {
    try {
      const json = JSON.parse(data);
      return json;
    } catch {
      return data;
    }
  }
  return data;
}

async function fetchCasesPage(page) {
  const params = {
    page,
    perPage: CASES_PER_PAGE,
    sortstatus: '',
    sorttype: '',
    status: 0,
    snatch_id: '',
    is_settle: '',
  };
  const res = await get(buildUrl(CASES_LIST_ENDPOINT), {
    params
  });
  if (res?.data?.code !== 1) {
    throw new Error(`Fetch cases failed (page ${page}): ${res?.data?.msg || 'unknown error'}`);
  }
  const data = normalizeDecryptedData(res?.data?.data);
  const list = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []);
  const total = typeof data?.total === 'number' ? data.total : (res?.data?.total ?? list.length);
  return { list, total };
}

async function fetchAllCases() {
  console.log('Fetching cases...');
  let page = 1;
  const all = [];
  // First fetch to get total
  const first = await fetchCasesPage(page);
  console.log(`Page ${page} fetched: ${first.list.length} cases`);
  all.push(...first.list);
  const total = first.total;
  const totalPages = Math.max(1, Math.ceil(total / CASES_PER_PAGE));
  console.log(`Total cases: ${total}, pages: ${totalPages}`);
  for (page = 2; page <= totalPages; page++) {
    const { list } = await fetchCasesPage(page);
    console.log(`Page ${page} fetched: ${list.length} cases`);
    all.push(...list);
  }
  console.log(`Total fetched cases: ${all.length}`);
  return all;
}

async function fetchCaseDetail(caseId) {
  const params = { case_id: caseId };
  const res = await getAxios().get(buildUrl(CASE_INFO_ENDPOINT), {
    params,
    headers: sessionToken ? { Token: sessionToken } : {},
  });
  if (res?.data?.code !== 1) {
    throw new Error(`Fetch case detail failed (id ${caseId}): ${res?.data?.msg || 'unknown error'}`);
  }
  return normalizeDecryptedData(res?.data?.data) || {};
}

function mapDetailToRow(detail) {
  // Adjust mapping based on actual API fields
  return {
    CaseID: detail?.case_id ?? detail?.id ?? '',
    Title: detail?.title ?? '',
    Status: detail?.status ?? '',
    CreatedAt: detail?.create_time ?? detail?.created_at ?? '',
    Owner: detail?.owner_name ?? '',
    Amount: detail?.amount ?? '',
  };
}

async function exportToExcel(rows, filename = 'cases.xlsx') {
  console.log(`Exporting ${rows.length} rows to ${filename}...`);
  const XLSX = getXLSX();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cases');
  XLSX.writeFile(workbook, filename);
  console.log(`Export completed: ${filename}`);
}

export async function runExport({ perPage = CASES_PER_PAGE, filename = 'cases.xlsx' } = {}) {
  try {
    console.log('Starting export...');
    if (perPage && Number.isFinite(perPage)) {
      CASES_PER_PAGE = perPage; // allow override within this run
    }
    await loginAndStoreToken();
    const cases = await fetchAllCases();
    const details = [];
    for (const c of cases) {
      const caseId = c?.case_id ?? c?.id;
      if (!caseId) continue;
      const d = await fetchCaseDetail(caseId);
      details.push(mapDetailToRow(d));
    }
    await exportToExcel(details, filename);
    console.log(`Done. Rows exported: ${details.length}`);
    return { count: details.length };
  } catch (err) {
    console.error('Export failed:', err);
    throw err;
  }
}

// Execute runExport when the file is run directly (Node ESM entry-point)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const perPageArg = Number(process.env.PER_PAGE || '');
      const filenameArg = process.env.FILENAME || 'cases.xlsx';
      const opts = {};
      if (Number.isFinite(perPageArg)) opts.perPage = perPageArg;
      if (filenameArg) opts.filename = filenameArg;
      const result = await runExport(opts);
      console.log(`Export finished. Rows: ${result.count}`);
      process.exit(0);
    } catch (e) {
      console.error('Export failed:', e);
      process.exit(1);
    }
  })();
}