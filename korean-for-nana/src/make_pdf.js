// 인쇄용 HTML → PDF (A4). 사용: node src/make_pdf.js (korean-for-nana 폴더에서)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const name of ['top50-print', 'workbook']) {
    await p.goto('file://' + path.resolve(name + '.html'), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.pdf({ path: name + '.pdf', format: 'A4', preferCSSPageSize: true, printBackground: true });
  }
  await b.close();
})();
