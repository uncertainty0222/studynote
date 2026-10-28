// top50-print.html → top50-print.pdf (A4). 사용: node src/make_pdf.js (korean-for-nana 폴더에서)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve('top50-print.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'top50-print.pdf', format: 'A4', preferCSSPageSize: true, printBackground: true });
  await b.close();
})();
