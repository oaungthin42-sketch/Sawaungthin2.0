const fs = require('fs');
const file = 'src/ai/index.js';
let content = fs.readFileSync(file, 'utf8');

const regex1 = /const modelName = process\.env\.GEMINI_MODEL \|\| 'gemini-1\.5-flash';/;
content = content.replace(regex1, `const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';`);

const regex2 = /} catch \(err\) \{[\s\S]*?console\.error\(\`\[AI\] Gemini translation attempt \$\{attempt\} failed: \$\{err\.message\}\`\);[\s\S]*?const isTransient = !err\.response \|\| err\.response\.status >= 500 \|\| err\.response\.status === 429 \|\| err\.code === 'ECONNABORTED';[\s\S]*?if \(attempt === maxRetries \|\| !isTransient\) \{[\s\S]*?throw new Error\(\`Gemini translation failed after \$\{attempt\} attempts\. Last error: \$\{err\.message\}\`\);[\s\S]*?\}[\s\S]*?await new Promise\(resolve => setTimeout\(resolve, delay\)\);[\s\S]*?delay \*= 2;[\s\S]*?\}/;

content = content.replace(regex2, `} catch (err) {
            let errorMsg = err.message;
            if (err.response && err.response.status === 404) {
                errorMsg = \`Model '\${modelName}' not found or unsupported (HTTP 404). Please configure a valid GEMINI_MODEL.\`;
            }
            console.error(\`[AI] Gemini translation attempt \${attempt} failed: \${errorMsg}\`);
            
            const isTransient = !err.response || err.response.status >= 500 || err.response.status === 429 || err.code === 'ECONNABORTED';
            if (attempt === maxRetries || !isTransient || (err.response && err.response.status === 404)) {
                throw new Error(\`Gemini translation failed. \${errorMsg}\`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }`);

fs.writeFileSync(file, content);
