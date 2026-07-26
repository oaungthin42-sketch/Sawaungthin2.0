const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const target = `  app.listen(PORT, '0.0.0.0', () => {`;
const replacement = `  // Diagnostic: test Chromium launch
  (async () => {
    try {
      const puppeteer = await import('puppeteer-core');
      let browserPath = '/usr/bin/chromium';
      if (!fs.existsSync(browserPath)) {
          browserPath = '/app/applet/puppeteer-cache/chrome/linux-150.0.7871.24/chrome-linux64/chrome';
      }
      const browser = await puppeteer.default.launch({
          executablePath: browserPath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      await browser.close();
      console.log("[DIAGNOSTIC] Chromium/Puppeteer launched successfully at boot.");
    } catch (e) {
      console.error("[DIAGNOSTIC] ERROR: Chromium/Puppeteer failed to launch at boot!", e.message);
    }
  })();

  app.listen(PORT, '0.0.0.0', () => {`;

code = code.replace(target, replacement);

fs.writeFileSync('server.js', code, 'utf8');
