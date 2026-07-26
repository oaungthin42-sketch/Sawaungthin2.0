const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/app/applet/puppeteer-cache/chrome/linux-150.0.7871.24/chrome-linux64/chrome'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920 });
  const start = Date.now();
  for (let i = 0; i < 50; i++) {
    await page.setContent(`<div style="color:white; font-size:40px; text-align:center; position:absolute; bottom:100px; width:100%;">Subtitle ${i}</div>`);
    await page.screenshot({ path: `sub_${i}.png`, omitBackground: true });
  }
  console.log(`Took ${Date.now() - start}ms`);
  await browser.close();
})();
