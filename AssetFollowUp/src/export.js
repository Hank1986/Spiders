// 扩展示例：自动翻页并导出所有页为 CSV
import { chromium } from 'playwright';
import fs from 'fs';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';

async function prompt(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', data => {
      process.stdin.pause();
      resolve(data.trim());
    });
  });
}

async function login(page) {
  await page.goto('http://ams.xiaoxiaojintz.com/web/common/index');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'login_page.png' });
  const captcha = await prompt('请输入验证码: ');

  const fill = async (selectors, value) => {
    for (const s of selectors) {
      const el = await page.$(s);
      if (el) { await el.fill(value); return true; }
    }
    return false;
  };
  await fill(['#username','input[name="username"]'], 'WW10318');
  await fill(['#password','input[name="password"]','input[type="password"]'], 'Aa123456@');
  await fill(['#captcha','input[name*="captcha"]','input[placeholder*="验证码"]'], captcha);
  const btn = await page.$('button:has-text("登录"),#loginBtn,.login-btn,#btn-save');
  if (btn) await btn.click(); else console.log('手动点击登录');
  await page.waitForTimeout(3000);
}

async function navigateToAsset(page) {
  try { await page.getByText('工单管理',{exact:false}).click(); } catch {}
  await page.waitForTimeout(800);
  try { await page.getByText('资产跟进',{exact:false}).click(); } catch (e) {
    console.error('无法点击资产跟进,请手动导航后按回车继续');
    await prompt('导航完成后回车继续');
  }
  await page.waitForTimeout(1500);
}

async function extractCurrentPage(page) {
  // 根据实际表格结构调整
  const data = await page.$$eval('table tbody tr', trs => trs.map(tr => {
    const tds = Array.from(tr.querySelectorAll('td'));
    return tds.map(td => td.innerText.trim());
  }).filter(r => r.length));
  return data;
}

async function clickNext(page) {
  // 常见分页：包含“下一页”按钮
  const nextLocators = [
    'button:has-text("下一页")',
    'a:has-text("下一页")',
    '.el-pagination button.btn-next',
    '.ant-pagination-next button',
  ];
  for (const sel of nextLocators) {
    const el = await page.$(sel);
    if (el) {
      const disabled = await el.getAttribute('disabled');
      if (disabled !== null) return false;
      const className = await el.getAttribute('class');
      if (className && /disabled/.test(className)) return false;
      await el.click();
      await page.waitForTimeout(1500);
      return true;
    }
  }
  return false;
}

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await login(page);
  await navigateToAsset(page);

  let allRows = [];
  let pageIndex = 1;
  while (true) {
    const rows = await extractCurrentPage(page);
    console.log(`第${pageIndex}页: 行数 ${rows.length}`);
    if (!rows.length) console.log('警告: 本页无数据或选择器不匹配');
    allRows.push(...rows);

    const hasNext = await clickNext(page);
    if (!hasNext) break;
    pageIndex++;
  }

  console.log(`总计行数: ${allRows.length}`);

  // 简单列头假设（需按实际字段修改）
  const maxCols = Math.max(...allRows.map(r => r.length));
  const headers = Array.from({ length: maxCols }, (_, i) => ({ id: `col${i+1}`, title: `列${i+1}` }));

  const records = allRows.map(r => {
    const obj = {}; r.forEach((v,i)=> obj[`col${i+1}`] = v); return obj;
  });

  const csvWriter = createCsvWriter({ path: 'asset_followup_all.csv', header: headers });
  await csvWriter.writeRecords(records);
  fs.writeFileSync('asset_followup_all.json', JSON.stringify(allRows, null, 2));

  console.log('已生成 asset_followup_all.csv 与 asset_followup_all.json');
  console.log('请遵守站点条款, 控制访问频率');
}

run().catch(e => { console.error(e); process.exit(1); });
