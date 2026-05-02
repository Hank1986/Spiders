// 登录并抓取资产跟进数据（需人工输入验证码）
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

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 50, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);

  // 通用重试 (最多3次)
  async function retry(fn, attempts = 3, delay = 100) {
    let lastErr;
    for (let i=1;i<=attempts;i++) {
      try { return await fn(i); } catch (e) { lastErr = e; if (i<attempts) await page.waitForTimeout(delay); }
    }
    throw lastErr;
  }
  // 等待页面加载完成 (DOM ready + 尝试 networkidle)
  async function waitForLoad(p = page, opts = {}) {
    const { networkIdle = true, timeout = 1000 } = opts;
    try { await p.waitForLoadState('domcontentloaded', { timeout }); } catch {}
    try { await p.waitForLoadState('load', { timeout }); } catch {}
    if (networkIdle) { try { await p.waitForLoadState('networkidle', { timeout }); } catch {} }
    // 额外保障: document.readyState
    try {
      await p.waitForFunction(() => document.readyState === 'complete', null, { timeout });
    } catch {}
  }

  await page.goto('http://ams.xiaoxiaojintz.com/web/common/index');
  await waitForLoad(page);

  // 等待验证码图片（需根据实际选择器调整）
  const captchaSelectorGuess = 'img[src*="captcha"], img.captcha';
  await page.waitForSelector(captchaSelectorGuess, { timeout: 2000 }).catch(()=>{});

  // 截图登录界面方便查看验证码
  await page.screenshot({ path: 'login_page.png', fullPage: false });
  console.log('已保存 login_page.png 请查看验证码');

  const username = 'WW10318';
  const password = 'Aa123456@';
  const captcha = await prompt('请输入验证码: ');

  // 根据实际 DOM 修改选择器
  const userSel = '#username, input[name="username"], input[placeholder*="用户名"], input[placeholder*="账号"]';
  const passSel = '#password, input[name="password"], input[type="password"]';
  const capSel = 'input[name*="captcha"], input[placeholder*="验证码"], #captcha';
  const loginBtnSel = 'button:has-text("登录"), #loginBtn, .login-btn, #btn-save';

  async function fillFirstWorking(selectorGroup, value) {
    const selectors = selectorGroup.split(',').map(s => s.trim()).filter(Boolean);
    for (const s of selectors) {
      const el = await page.$(s);
      if (el) {
        await el.fill(value);
        return true;
      }
    }
    return false;
  }

  await fillFirstWorking(userSel, username);
  await fillFirstWorking(passSel, password);
  await fillFirstWorking(capSel, captcha);

  // 点击登录
  const loginBtn = await page.locator(loginBtnSel);
  const count = await loginBtn.count();
  if (count > 0) {
    await loginBtn.first().click();
    await waitForLoad(page); // 登录后等待
  } else {
    console.warn('未找到登录按钮，需要手动点击');
    await waitForLoad(page);
  }

  // 等待跳转或菜单加载 (缩短)
  await page.waitForTimeout(500);

  // Debug 登录后截图
  try { await page.screenshot({ path: 'after_login.png' }); } catch {}

  // 记录所有 frame 名称与 URL 便于分析
  await page.waitForTimeout(2000);
  const framesInfo = page.frames().map(f => ({ name: f.name(), url: f.url() }));
  fs.writeFileSync('frames_dump.json', JSON.stringify(framesInfo, null, 2));
  console.log('Frames:', framesInfo);

  // 进入 工单管理 -> 资产跟进（假设在 left 名称的侧边栏 frame 中）
  let leftFrame = page.frame({ name: 'left' });
  if (!leftFrame) {
    // 尝试通过 URL 或索引猜测：选取包含 "left" 的 URL 或第一个子 frame
    leftFrame = page.frames().find(f => /left/i.test(f.url())) || page.frames().find(f => f !== page.mainFrame());
  }
  if (!leftFrame) {
    console.warn('未找到侧边栏 frame，需手动导航');
  } else {
    try {
      await leftFrame.locator('text=工单管理').first().click({ timeout: 500 });
      await waitForLoad(page, { networkIdle: false });
    } catch (e) {
      console.warn('点击工单管理失败:', e.message);
    }
    await page.waitForTimeout(800); // 缩短 frame 枚举等待
    try {
      await leftFrame.locator('text=资产跟进').first().click({ timeout: 3000 });
      await waitForLoad(page, { networkIdle: false });
    } catch (e) {
      console.error('点击资产跟进失败，可能需要手动展开菜单:', e.message);
      await prompt('请在浏览器中手动进入资产跟进页面后回车继续');
      await waitForLoad(page);
    }
  }

  await page.screenshot({ path: 'after_nav.png' }).catch(()=>{});

  // 定位数据所在 frame (名称 rigth 拼写按页面实际)
  let dataFrame = page.frame({ name: 'rigth' });
  if (!dataFrame) {
    dataFrame = page.frames().find(f => /right|rigth/i.test(f.name()) || /right/i.test(f.url()));
  }
  if (!dataFrame) {
    console.error('未找到数据 frame，需人工确认后回车继续');
    await prompt('请确认页面加载完成后回车继续');
    await waitForLoad(page);
    dataFrame = page.frame({ name: 'rigth' });
  }

  // 抽取当前页函数 (减少循环与延迟)
  async function extractPageRows() {
    for (let i=0;i<10;i++) { // 原20 -> 10
      if (await dataFrame.locator('#datatable').count()) break;
      await page.waitForTimeout(150); // 原300 -> 150
    }
    const hasDataTable = await dataFrame.locator('#datatable').count();
    if (hasDataTable) {
      return await dataFrame.$$eval('#datatable tbody tr', trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())).filter(r => r.length));
    }
    // 回退其他通用选择器
    const fallbackSelectors = ['table#datatable tbody tr','table tbody tr'];
    for (const sel of fallbackSelectors) {
      const c = await dataFrame.locator(sel).count();
      if (c) {
        return await dataFrame.$$eval(sel, trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())).filter(r => r.length));
      }
    }
    return [];
  }

  // 翻页点击函数 (修正 text= 语法 & 去除错误组合选择器)
  async function clickNextPage() {
    const candidates = [ dataFrame.locator('a[title="下一页"]') ];
    for (const loc of candidates) {
      if (await loc.count()) {
        const disabledAttr = await loc.getAttribute('disabled');
        const ariaDisabled = await loc.getAttribute('aria-disabled');
        const cls = await loc.getAttribute('class');
        if (disabledAttr !== null || ariaDisabled === 'true' || (cls && /disabled|disable|unavailable/i.test(cls))) return false;
        try {
          await loc.click({ timeout: 1500 });
          await waitForLoad(page, { networkIdle: true, timeout: 500 });
          // 等待表格刷新: 简单检测首行文本变化或重新出现
          for (let i=0;i<10;i++) {
            const rowCount = await dataFrame.locator('#datatable tbody tr').count();
            if (rowCount) break;
            await page.waitForTimeout(100);
          }
          return true;
        } catch (e) {
          console.warn('点击下一页失败:', e.message);
          return false;
        }
      }
    }
    return false;
  }

  // 抽取单条详情
  async function extractDetail(rowIndex) {
    const rowBaseSelector = `#datatable > tbody > tr:nth-child(${rowIndex})`;
    const opLinkSelectorPrimary = `${rowBaseSelector} td.td-operation ul li:nth-child(1) a`;
    const opLinkTextFallback = `${rowBaseSelector} a:has-text("催收登记")`;
    const rowLocator = dataFrame.locator(rowBaseSelector);
    try { await rowLocator.scrollIntoViewIfNeeded(); } catch {}
    let opLink = dataFrame.locator(opLinkSelectorPrimary);
    if (!(await opLink.count())) opLink = dataFrame.locator(opLinkTextFallback);
    if (!(await opLink.count())) return { detail1: '', detail2: '', detail3: '' };
    const href = await opLink.getAttribute('href');
    if (!href) return { detail1: '', detail2: '', detail3: '' };
    const base = new URL(page.url());
    const detailUrl = href.startsWith('http') ? href : `${base.origin}${href}`;
    const detailPage = await context.newPage();
    try {
      await retry(() => detailPage.goto(detailUrl, { timeout: 1000 }), 3);
      await waitForLoad(detailPage, { networkIdle: true, timeout: 1000 });
    } catch (e) {
      console.warn('详情页加载失败(已重试3次):', e.message);
      await detailPage.close();
      return { detail1: '', detail2: '', detail3: '' };
    }

    const dFrame = detailPage.mainFrame();
    const detail1Sel = 'body > div.page-container > div > div:nth-child(2) > div > div.portlet-body.util-btn-margin-bottom-5 > div:nth-child(6) > div:nth-child(4) > div > div.col-xs-7.field-body > label';
    await dFrame.waitForSelector(detail1Sel, { timeout: 500 }).catch(()=>{}); // 原8000
    const detail1 = await dFrame.locator(detail1Sel).first().innerText().catch(()=> '');
    const detail2Labels = await dFrame.locator('body > div.page-container > div > div:nth-child(3) > div > div:nth-child(2) label').allInnerTexts().catch(()=>[]);
    const detail2 = detail2Labels.map(t=>t.trim()).filter(Boolean).join(' ');
    const detail3 = await dFrame.locator('body > div.page-container > div > div:nth-child(4) > div:nth-child(1) > div.field-body > label').first().innerText().catch(()=> '');

    // 关闭详情页，无需返回
    await detailPage.close();
    return { detail1, detail2, detail3 };
  }

  // 分页循环 (提取基础行 + 详情)
  let enrichedRows = [];
  for (let pageIndex = 1; pageIndex <= 200; pageIndex++) {
    // 确保列表页加载稳定
    await waitForLoad(page, { networkIdle: false, timeout: 500 });
    for (let w=0; w<15; w++) { // 原40 -> 15
      if (await dataFrame.locator('#datatable').count()) break;
      await page.waitForTimeout(120); // 原250
    }
    const rowLocators = dataFrame.locator('#datatable tbody tr');
    const rowCount = await rowLocators.count();
    console.log(`第 ${pageIndex} 页行数: ${rowCount}`);
    for (let i=1; i<=rowCount; i++) {
      const cells = await dataFrame.$$eval(`#datatable tbody tr:nth-child(${i}) td`, tds => tds.map(td => td.innerText.trim()));
      let detailData;
      try { detailData = await extractDetail(i); } catch { detailData = { detail1:'', detail2:'', detail3:'' }; }
      enrichedRows.push({ base: cells, ...detailData, page: pageIndex, row: i });
    }
    const hasNext = await clickNextPage();
    if (!hasNext) break;
  }

  // 导出第一页基础行（兼容旧文件）
  const firstPageBasic = enrichedRows.filter(r => r.page === 1).map(r => r.base);
  fs.writeFileSync('asset_followup_page1.json', JSON.stringify(firstPageBasic, null, 2));

  // 全量 JSON （包含详情）
  fs.writeFileSync('asset_followup_all_enriched.json', JSON.stringify(enrichedRows, null, 2));

  // CSV 导出
  if (enrichedRows.length) {
    const maxBaseCols = Math.max(...enrichedRows.map(r => r.base.length));
    const headers = [
      { id: 'page', title: '页' },
      { id: 'row', title: '行' },
      ...Array.from({ length: maxBaseCols }, (_, i) => ({ id: `col${i+1}`, title: `列${i+1}` })),
      { id: 'detail1', title: '详情1' },
      { id: 'detail2', title: '详情2' },
      { id: 'detail3', title: '详情3' }
    ];
    const records = enrichedRows.map(r => {
      const obj = { page: r.page, row: r.row, detail1: r.detail1, detail2: r.detail2, detail3: r.detail3 };
      r.base.forEach((v,i)=> obj[`col${i+1}`] = v);
      return obj;
    });
    const csvWriter = createCsvWriter({ path: 'asset_followup_all_enriched.csv', header: headers });
    await csvWriter.writeRecords(records);
    console.log('已写入 asset_followup_all_enriched.csv');
  } else {
    console.warn('没有任何行，未生成 enriched CSV');
  }

  console.log(`总记录数(含详情): ${enrichedRows.length}`);
  console.log('完成详情抓取');

  // 保持浏览器打开以便人工检查
  console.log('脚本完成，可手动关闭浏览器');
}

run().catch(e => {
  console.error('脚本异常:', e);
  process.exit(1);
});
