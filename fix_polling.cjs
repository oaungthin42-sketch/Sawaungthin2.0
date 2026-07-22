const fs = require('fs');
const path = require('path');
const appTsxPath = path.join(__dirname, 'src/App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf8');

const oldPolling = `      } catch (e) {
         clearInterval(interval);
         setStatus('error');
         setErrorMsg('Polling failed');
      }`;

const newPolling = `      } catch (e) {
         console.warn('Polling error (transient)', e);
         pollErrors++;
         if (pollErrors > 10) {
            clearInterval(interval);
            setStatus('error');
            setErrorMsg('Polling failed after multiple retries.');
         }
      }`;

content = content.replace(oldPolling, newPolling);
content = content.replace('const startPolling = (id: string) => {', 'const startPolling = (id: string) => {\n    let pollErrors = 0;');

fs.writeFileSync(appTsxPath, content);
console.log('Fixed polling');
