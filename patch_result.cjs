const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

code = code.replace(
    /result: \{\s*metadata:/g,
    `result: {\n                warnings: state.warnings,\n                metadata:`
);

fs.writeFileSync('src/workers/processor.js', code, 'utf8');
