
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import apiRoutes from './src/routes/api.js';

import { initModels } from './src/ai/index.js';
import { recoverStuckJobs } from './src/services/jobManager.js';
import { startCleanupSweep } from './src/services/cleanup.js';

const app = express();
app.use(cors());
app.use(express.json());

// Serve outputs
app.use('/output', express.static(path.join(process.cwd(), 'public', 'output')));

// Setup API routes
app.use('/api', apiRoutes);

async function startServer() {
  recoverStuckJobs();
  startCleanupSweep();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/^(?!\/(api|output)).*$/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  // Diagnostic: test Chromium launch
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
