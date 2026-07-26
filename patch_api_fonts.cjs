const fs = require('fs');
let code = fs.readFileSync('src/routes/api.js', 'utf8');

const target = `        const fontId = uuidv4();
        const storedFilename = req.file.filename;
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

        const stmt = db.prepare(\`INSERT INTO fonts (id, originalName, storedFilename) VALUES (?, ?, ?)\`);
        stmt.run(fontId, originalName, storedFilename);

        res.json({ id: fontId, originalName, url: \`/fonts/\${storedFilename}\` });`;

const replacement = `        const storedFilename = req.file.filename;
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

        // Check for existing font with same name
        const existing = db.prepare('SELECT id, storedFilename FROM fonts WHERE originalName = ?').get(originalName);
        let fontId;
        if (existing) {
            fontId = existing.id;
            // Optionally delete old file
            try {
                const oldPath = path.join(process.cwd(), 'public', 'fonts', existing.storedFilename);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            } catch(e) {}
            
            db.prepare('UPDATE fonts SET storedFilename = ? WHERE id = ?').run(storedFilename, fontId);
        } else {
            fontId = uuidv4();
            db.prepare('INSERT INTO fonts (id, originalName, storedFilename) VALUES (?, ?, ?)').run(fontId, originalName, storedFilename);
        }

        res.json({ id: fontId, originalName, url: \`/fonts/\${storedFilename}\` });`;

code = code.replace(target, replacement);

fs.writeFileSync('src/routes/api.js', code, 'utf8');
