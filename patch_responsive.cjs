const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Container padding
code = code.replace(/className="max-w-7xl mx-auto p-4 md:p-6/g, 'className="max-w-7xl mx-auto p-2 sm:p-4 md:p-6');
code = code.replace(/className="p-6/g, 'className="p-4 sm:p-6');

// Preview max-height
code = code.replace(/max-h-\[70vh\]/g, 'max-h-[50vh] sm:max-h-[70vh]');

// Font sizes
code = code.replace(/text-xl/g, 'text-lg sm:text-xl');
code = code.replace(/text-2xl/g, 'text-xl sm:text-2xl');

// Flex direction where md:flex-row is already used, maybe add flex-col for mobile?
// It seems the code already has flex-col md:flex-row in many places.

fs.writeFileSync('src/App.tsx', code, 'utf8');
