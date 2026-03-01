const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = 'admin-dashboard-access-key-777';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Database Setup
const db = new sqlite3.Database(path.join(__dirname, 'voyage.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT,
        phoneNumber TEXT,
        birthDate TEXT,
        gender TEXT,
        birthPlace TEXT,
        currentAddress TEXT,
        jobType TEXT,
        firstAid TEXT,
        timestamp TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS feature_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        filename TEXT
    )`);
});

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware
app.use(bodyParser.json());

// SECURITY: Prevent direct access to sensitive files
const protectedFiles = ['voyage.db', 'server.js', 'package.json', 'package-lock.json', '.gitignore', 'admin.html'];
app.use((req, res, next) => {
    const requestedFile = path.basename(req.url);
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

// API: Register
app.post('/api/register', (req, res) => {
    const p = req.body;
    const stmt = db.prepare(`INSERT INTO participants (fullName, phoneNumber, birthDate, gender, birthPlace, currentAddress, jobType, firstAid, timestamp) VALUES (?,?,?,?,?,?,?,?,?)`);
    stmt.run(p.fullName, p.phoneNumber, p.birthDate, p.gender, p.birthPlace, p.currentAddress, p.jobType, p.firstAid, new Date().toISOString(), (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.status(201).json({ message: 'Success' });
    });
    stmt.finalize();
});

// API: Get Participants (Admin)
app.get('/api/participants', adminAuth, (req, res) => {
    db.all(`SELECT * FROM participants ORDER BY id DESC`, [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

// API: Upload Feature Images (Admin)
app.post('/api/upload-image', adminAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { category } = req.body;
    const filename = req.file.filename;
    db.run(`INSERT INTO feature_images (category, filename) VALUES (?, ?)`, [category, filename], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'Uploaded successfully', filename, id: this.lastID });
    });
});

// API: Get All Feature Images with IDs (Admin)
app.get('/api/admin-features', adminAuth, (req, res) => {
    db.all(`SELECT * FROM feature_images`, [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

// API: Get Feature Images grouped (Public)
app.get('/api/features', (req, res) => {
    db.all(`SELECT * FROM feature_images`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

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
    });
});

// API: Delete Image (Admin)
app.delete('/api/delete-image/:id', adminAuth, (req, res) => {
    db.get(`SELECT filename FROM feature_images WHERE id = ?`, [req.params.id], (err, row) => {
        if (row) {
            fs.remove(path.join(uploadsDir, row.filename)).catch(err => console.error(err));
            db.run(`DELETE FROM feature_images WHERE id = ?`, [req.params.id], () => {
                res.json({ message: 'Deleted' });
            });
        } else res.status(404).json({ error: 'Not found' });
    });
});

// Admin Route
app.get(`/${ADMIN_TOKEN}`, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
