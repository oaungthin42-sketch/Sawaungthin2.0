import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const importStr = "import { SettingsModal } from './components/SettingsModal';\n";

if (!content.includes('SettingsModal')) {
    content = content.replace("import React, { useState, useRef, useEffect } from 'react';", "import React, { useState, useRef, useEffect } from 'react';\n" + importStr);
}

// Keep the top part up to showSettings
const lines = content.split('\n');
let start = lines.findIndex(l => l.includes('{showSettings && ('));
if (start === -1) {
    start = lines.findIndex(l => l.includes('<SettingsModal'));
}

const before = lines.slice(0, start);

const middle = `        <SettingsModal 
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

// Wait! We can get the rest of the file from task 210 output.
// No, task 210's output is heavily truncated in the log "truncated 23 bytes".
// However, task 254 contains the EXACT ENDING OF THE FILE, starting from `peline Complete</h2>`.
// And task 216 contains the EXACT START OF THE FILE, wait, no, task 216 output is truncated too!
