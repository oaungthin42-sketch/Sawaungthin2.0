const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /              <\/div>\n\n            \{\/\* Step 7: Final Preview \*\/\}/,
  "              </div></div>)}\n\n            {/* Step 7: Final Preview */}"
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
