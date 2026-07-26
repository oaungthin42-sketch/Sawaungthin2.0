const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /                      <\/div>\n                    <\/div>\n                  \) : \(\n                    <div className="flex flex-col items-center gap-3 text-center text-gray-500">/,
  '                      </div>\n                      </div>\n                    </div>\n                  ) : (\n                    <div className="flex flex-col items-center gap-3 text-center text-gray-500">'
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
