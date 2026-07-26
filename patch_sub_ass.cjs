const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = `                        const filterComplex = job.selectedFontId
                            ? \`[0:v]subtitles='\${assPath.replace(/:/g, '\\\\:')}':fontsdir='\${path.join(process.cwd(), 'public', 'fonts').replace(/:/g, '\\\\:')}':charenc=UTF-8[v]\`
                            : \`[0:v]subtitles='\${assPath.replace(/:/g, '\\\\:')}':charenc=UTF-8[v]\`;`;

const replacement = `                        const filterComplex = job.selectedFontId
                            ? \`[0:v]ass='\${assPath.replace(/:/g, '\\\\:')}':fontsdir='\${path.join(process.cwd(), 'public', 'fonts').replace(/:/g, '\\\\:')}'[v]\`
                            : \`[0:v]ass='\${assPath.replace(/:/g, '\\\\:')}'[v]\`;`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/workers/processor.js', code, 'utf8');
    console.log('Successfully patched!');
} else {
    console.error('Target string not found.');
}
