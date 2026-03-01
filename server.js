const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIG: Use environment variables for production security
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.fptkwyxxazlomleytgpd:_FixZ4A%2FkbCa7AF@aws-1-eu-west-1.pooler.supabase.com:6543/postgres";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-dashboard-access-key-777';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// PostgreSQL Setup
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Initialize database tables
async function initDb() {
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
            filename TEXT
        )`);

        try {
            await pool.query(`ALTER TABLE participants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
        } catch (e) {}

        console.log("PostgreSQL database initialized.");
    } catch (err) {
        console.error("Database initialization error:", err);
    }
}
initDb();

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error("Error: Images only!"));
    }
});

// Middleware
app.use(bodyParser.json());

// SECURITY: Prevent direct access to sensitive system files
const protectedFiles = ['server.js', 'package.json', 'package-lock.json', '.gitignore', 'admin.html', 'voyage.db', 'README.md'];
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

// Serve static files
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

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

// API: Upload Feature Images (Admin Protected)
app.post('/api/upload-image', adminAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { category } = req.body;
    const filename = req.file.filename;
    try {
        const { rows } = await pool.query(`INSERT INTO feature_images (category, filename) VALUES ($1, $2) RETURNING id`, [category, filename]);
        res.json({ message: 'Uploaded successfully', filename, id: rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get All Feature Images with IDs (Admin Protected)
app.get('/api/admin-features', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM feature_images`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get Feature Images grouped (Public)
app.get('/api/features', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM feature_images`);
        const features = {
            hotel: { title: "فندق 4 نجوم", images: [] },
            beaches: { title: "شواطئ فيروزية", images: [] },
            baths: { title: "حمامات معدنية", images: [] },
            park: { title: "ألعاب مائية وملاهي", images: [] }
        };
        rows.forEach(row => {
            if (features[row.category]) {
                features[row.category].images.push(`/uploads/${row.filename}`);
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
        const { rows } = await pool.query(`SELECT filename FROM feature_images WHERE id = $1`, [req.params.id]);
        if (rows.length > 0) {
            await fs.remove(path.join(uploadsDir, rows[0].filename)).catch(err => console.error(err));
            await pool.query(`DELETE FROM feature_images WHERE id = $1`, [req.params.id]);
            res.json({ message: 'Deleted' });
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Route - Serves admin.html securely and injects the token
app.get(`/${ADMIN_TOKEN}`, (req, res) => {
    let content = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    // Inject the current token into the HTML so the frontend can use it
    content = content.replace('const ADMIN_TOKEN = \'\';', `const ADMIN_TOKEN = '${ADMIN_TOKEN}';`);
    res.send(content);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
