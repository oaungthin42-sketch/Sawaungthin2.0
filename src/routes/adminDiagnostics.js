import express from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, adminOnly } from './auth.js';

const router = express.Router();

function getFilesRecursively(dir, baseDir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    
    let list;
    try {
        list = fs.readdirSync(dir);
    } catch (e) {
        return results;
    }
    
    for (const file of list) {
        const fullPath = path.join(dir, file);
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                results = results.concat(getFilesRecursively(fullPath, baseDir));
            } else {
                results.push({
                    relativePath: path.relative(baseDir, fullPath),
                    sizeBytes: stat.size,
                    mtime: stat.mtime.toISOString()
                });
            }
        } catch (err) {
            // gracefully skip unreadable files
        }
    }
    return results;
}

router.get('/diagnose-storage', authMiddleware, adminOnly, async (req, res) => {
    try {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            return res.json({ totalSizeBytes: 0, totalSizeMB: 0, breakdown: [], largestFiles: [] });
        }

        const items = fs.readdirSync(dataDir);
        let totalSizeBytes = 0;
        let allFiles = [];
        let breakdown = [];

        for (const item of items) {
            const fullPath = path.join(dataDir, item);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    const dirFiles = getFilesRecursively(fullPath, dataDir);
                    const dirSizeBytes = dirFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
                    totalSizeBytes += dirSizeBytes;
                    allFiles = allFiles.concat(dirFiles);
                    breakdown.push({
                        directory: item,
                        totalSizeBytes: dirSizeBytes,
                        totalSizeMB: parseFloat((dirSizeBytes / (1024 * 1024)).toFixed(2)),
                        fileCount: dirFiles.length
                    });
                } else {
                    totalSizeBytes += stat.size;
                    allFiles.push({
                        relativePath: item,
                        sizeBytes: stat.size,
                        mtime: stat.mtime.toISOString()
                    });
                }
            } catch (err) {
                // gracefully skip unreadable items
            }
        }

        allFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
        const largestFiles = allFiles.slice(0, 40).map(f => ({
            path: f.relativePath,
            sizeMB: parseFloat((f.sizeBytes / (1024 * 1024)).toFixed(2)),
            mtime: f.mtime
        }));

        res.json({
            totalSizeBytes,
            totalSizeMB: parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(2)),
            breakdown,
            largestFiles
        });

    } catch (err) {
        console.error("Storage diagnosis error", err);
        res.status(500).json({ error: "Failed to diagnose storage", details: err.message });
    }
});

export default router;
