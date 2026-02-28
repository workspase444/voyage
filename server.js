const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'participants.json');
const FEATURES_FILE = path.join(__dirname, 'features.json');
const ADMIN_TOKEN = 'admin-dashboard-access-key-777';

// Middleware
app.use(bodyParser.json());

// SECURITY: Prevent direct browser access to sensitive files
const protectedFiles = ['participants.json', 'features.json', 'server.js', 'package.json', 'package-lock.json', '.gitignore', 'admin.html'];
app.use((req, res, next) => {
    const requestedFile = path.basename(req.url);
    if (protectedFiles.includes(requestedFile)) {
        return res.status(403).send('Access Denied');
    }
    next();
});

// SECURITY: Admin Auth Middleware
const adminAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (token === ADMIN_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Serve root directory statically
app.use(express.static(__dirname));

// Initialize data files
async function initFiles() {
    if (!await fs.pathExists(DATA_FILE)) {
        await fs.writeJson(DATA_FILE, []);
    }
    if (!await fs.pathExists(FEATURES_FILE)) {
        const defaultFeatures = {
            hotel: { title: "فندق 4 نجوم", image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80" },
            beaches: { title: "شواطئ فيروزية", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80" },
            baths: { title: "حمامات معدنية", image: "https://images.unsplash.com/photo-1544161515-4ae6ce6ca606?auto=format&fit=crop&w=800&q=80" },
            park: { title: "ألعاب مائية وملاهي", image: "https://images.unsplash.com/photo-1513889959010-65a4ec4104bd?auto=format&fit=crop&w=800&q=80" }
        };
        await fs.writeJson(FEATURES_FILE, defaultFeatures);
    }
}
initFiles();

// API: Register a new participant (Public)
app.post('/api/register', async (req, res) => {
    try {
        const participants = await fs.readJson(DATA_FILE);
        participants.push({ ...req.body, timestamp: new Date().toISOString() });
        await fs.writeJson(DATA_FILE, participants, { spaces: 2 });
        res.status(201).json({ message: 'Success' });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API: Get all participants (Admin Protected)
app.get('/api/participants', adminAuth, async (req, res) => {
    try {
        const participants = await fs.readJson(DATA_FILE);
        res.json(participants);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API: Get features (Public)
app.get('/api/features', async (req, res) => {
    try {
        const features = await fs.readJson(FEATURES_FILE);
        res.json(features);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API: Update features (Admin Protected)
app.post('/api/features', adminAuth, async (req, res) => {
    try {
        await fs.writeJson(FEATURES_FILE, req.body, { spaces: 2 });
        res.json({ message: 'Success' });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin Route
app.get(`/${ADMIN_TOKEN}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
