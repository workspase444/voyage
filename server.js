const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIG: Production security using Environment Variables
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-dashboard-access-key-777';

if (!DATABASE_URL) {
    console.error("FATAL: DATABASE_URL environment variable is not set.");
}

// PostgreSQL Setup
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Initialize database tables
async function initDb() {
    if (!DATABASE_URL) return;
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS participants (
            id SERIAL PRIMARY KEY,
            fullName TEXT,
            phoneNumber TEXT,
            birthDate TEXT,
            gender TEXT,
            birthPlace TEXT,
            currentAddress TEXT,
            jobType TEXT,
            firstAid TEXT,
            status TEXT DEFAULT 'pending',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS feature_images (
            id SERIAL PRIMARY KEY,
            category TEXT,
            filename TEXT,
            image_data TEXT
        )`);

        try { await pool.query(`ALTER TABLE participants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`); } catch (e) {}
        try { await pool.query(`ALTER TABLE feature_images ADD COLUMN IF NOT EXISTS image_data TEXT`); } catch (e) {}

        console.log("PostgreSQL database initialized.");
    } catch (err) {
        console.error("Database initialization error:", err);
    }
}
initDb();

// Multer Storage (Memory storage for Base64 conversion)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype) return cb(null, true);
        cb(new Error("Images only!"));
    }
});

// Middleware
app.use(bodyParser.json({ limit: '5mb' }));

// SECURITY: Prevent direct access to sensitive system files
const protectedFiles = ['server.js', 'package.json', 'package-lock.json', '.gitignore', 'admin.html', 'README.md'];
app.use((req, res, next) => {
    const requestedFile = path.basename(req.path);
    if (protectedFiles.includes(requestedFile)) {
        return res.status(403).send('Access Denied');
    }
    next();
});

// Admin Auth Middleware
const adminAuth = (req, res, next) => {
    if (req.headers['x-admin-token'] === ADMIN_TOKEN) next();
    else res.status(401).json({ error: 'Unauthorized' });
};

// Serve static files from root
app.use(express.static(__dirname));

// API: Register (Public)
app.post('/api/register', async (req, res) => {
    const p = req.body;
    try {
        await pool.query(
            `INSERT INTO participants (fullName, phoneNumber, birthDate, gender, birthPlace, currentAddress, jobType, firstAid) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [p.fullName, p.phoneNumber, p.birthDate, p.gender, p.birthPlace, p.currentAddress, p.jobType, p.firstAid]
        );
        res.status(201).json({ message: 'Success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get Participants (Admin Protected)
app.get('/api/participants', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM participants ORDER BY id DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Update Participant Status (Admin Protected)
app.patch('/api/participants/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query(`UPDATE participants SET status = $1 WHERE id = $2`, [status, req.params.id]);
        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Delete Participant (Admin Protected)
app.delete('/api/participants/:id', adminAuth, async (req, res) => {
    try {
        await pool.query(`DELETE FROM participants WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Upload Feature Images as Base64 (Admin Protected)
app.post('/api/upload-image', adminAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { category } = req.body;
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    try {
        const { rows } = await pool.query(`INSERT INTO feature_images (category, filename, image_data) VALUES ($1, $2, $3) RETURNING id`, [category, req.file.originalname, base64Data]);
        res.json({ message: 'Uploaded successfully', id: rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get All Feature Images with IDs (Admin Protected)
app.get('/api/admin-features', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, category, image_data FROM feature_images`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get Feature Images grouped (Public)
app.get('/api/features', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT category, image_data FROM feature_images`);
        const features = {
            hotel: { title: "فندق 4 نجوم", images: [] },
            beaches: { title: "شواطئ فيروزية", images: [] },
            baths: { title: "حمامات معدنية", images: [] },
            park: { title: "ألعاب مائية وملاهي", images: [] }
        };
        rows.forEach(row => {
            if (features[row.category]) {
                features[row.category].images.push(row.image_data);
            }
        });
        res.json(features);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Delete Image (Admin Protected)
app.delete('/api/delete-image/:id', adminAuth, async (req, res) => {
    try {
        await pool.query(`DELETE FROM feature_images WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Route - Serves admin.html and injects the token
app.get(`/${ADMIN_TOKEN}`, (req, res) => {
    let content = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    content = content.replace('const ADMIN_TOKEN = \'\';', `const ADMIN_TOKEN = '${ADMIN_TOKEN}';`);
    res.send(content);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
