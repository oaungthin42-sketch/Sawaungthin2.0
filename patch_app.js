import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const importStr = "import { SettingsModal } from './components/SettingsModal.tsx';\n";

if (!content.includes('SettingsModal')) {
    content = content.replace("import React, { useState, useRef, useEffect } from 'react';", "import React, { useState, useRef, useEffect } from 'react';\n" + importStr);
}

const lines = content.split('\n');
let start = lines.findIndex(l => l.includes('{showSettings && ('));
let end = lines.findIndex((l, i) => i > start && l.includes('        </div>') && lines[i+1]?.includes('      </div>') && lines[i+2]?.includes('    </div>') && lines[i+3]?.includes('  )'));

if (start !== -1 && end !== -1) {
    const before = lines.slice(0, start);
    // Find the end of the showSettings block which matches the nesting level
    const settingsBlock = `<SettingsModal 
          showSettings={showSettings} 
          setShowSettings={setShowSettings}
          settings={settings}
          editSettings={editSettings}
          setEditSettings={setEditSettings}
          saveSetting={saveSetting}
          deleteSetting={deleteSetting}
          settingsSaving={settingsSaving}
          voices={voices}
          previewingVoice={previewingVoice}
          handlePreviewVoice={handlePreviewVoice}
          showKeys={showKeys}
          setShowKeys={setShowKeys}
        />`;
    const after = lines.slice(end + 1);
    
    fs.writeFileSync('src/App.tsx', before.join('\n') + '\n        ' + settingsBlock + '\n' + after.join('\n'));
    console.log("Successfully patched App.tsx");
} else {
    console.log("Failed to find showSettings block bounds");
}
