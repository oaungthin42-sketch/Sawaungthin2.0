const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = `                                <body style="margin:0; padding:0; background:transparent;">
                                    <div style="
                                        font-size:\${fontsize}px; 
                                        color:white; 
                                        text-align:center; 
                                        -webkit-text-stroke: \${Math.max(2, Math.floor(fontsize/20))}px black; 
                                        white-space:pre-wrap; 
                                        width:\${pos.widthPct}vw; 
                                        position:absolute; 
                                        left:\${pos.xPct}vw; 
                                        top:\${pos.yPct}vh; 
                                        text-shadow: 0px 4px 10px rgba(0,0,0,0.8);
                                        line-height:1.2;
                                        transform: translateY(-50%);
                                    ">\${sub.text}</div>
                                </body>
                                </html>
                                \`;
                                await page.setContent(html);
                                await page.screenshot({ path: pngPath, omitBackground: true });`;

const replacement = `                                <body style="margin:0; padding:0; background:transparent;">
                                    <div style="
                                        font-size:\${fontsize}px; 
                                        color:white; 
                                        text-align:center; 
                                        -webkit-text-stroke: \${Math.max(2, Math.floor(fontsize/20))}px black; 
                                        white-space:pre-wrap; 
                                        width:\${pos.widthPct}vw; 
                                        height:\${pos.heightPct}vh; 
                                        position:absolute; 
                                        left:\${pos.xPct}vw; 
                                        top:\${pos.yPct}vh; 
                                        display:flex; 
                                        align-items:center; 
                                        justify-content:center; 
                                        text-shadow: 0px 4px 10px rgba(0,0,0,0.8);
                                        line-height:1.2;
                                    ">\${sub.text}</div>
                                </body>
                                </html>
                                \`;
                                await page.setContent(html);
                                await page.evaluate(() => document.fonts.ready);
                                await page.screenshot({ path: pngPath, omitBackground: true });`;

if (!code.includes(target)) {
    console.error("Target not found!");
    process.exit(1);
}

code = code.replace(target, replacement);
fs.writeFileSync('src/workers/processor.js', code, 'utf8');
