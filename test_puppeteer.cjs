const puppeteer = require('puppeteer');
(async () => {
  try {
    const browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/app/applet/puppeteer-cache/chrome/linux-150.0.7871.24/chrome-linux64/chrome'
    });
    console.log("Launched successfully!");
    await browser.close();
  } catch (e) {
    console.error(e);
  }
})();
