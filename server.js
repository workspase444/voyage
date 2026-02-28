const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'participants.json');

// Middleware
app.use(bodyParser.json());

// SECURITY: Prevent direct browser access to sensitive files while serving root statically
const protectedFiles = ['participants.json', 'server.js', 'package.json', 'package-lock.json', '.gitignore', 'admin.html'];
app.use((req, res, next) => {
    const requestedFile = path.basename(req.url);
    if (protectedFiles.includes(requestedFile)) {
        return res.status(403).send('Access Denied');
    }
    next();
});

// Serve root directory statically (for index.html and other assets)
app.use(express.static(__dirname));

// Initialize data file if it doesn't exist
async function initDataFile() {
    if (!await fs.pathExists(DATA_FILE)) {
        await fs.writeJson(DATA_FILE, []);
    }
}
initDataFile();

// API: Register a new participant
app.post('/api/register', async (req, res) => {
    try {
        const participant = {
            ...req.body,
            timestamp: new Date().toISOString()
        };

        const participants = await fs.readJson(DATA_FILE);
        participants.push(participant);
        await fs.writeJson(DATA_FILE, participants, { spaces: 2 });

        console.log('New participant registered:', participant.fullName);
        res.status(201).json({ message: 'Success' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API: Get all participants
app.get('/api/participants', async (req, res) => {
    try {
        const participants = await fs.readJson(DATA_FILE);
        res.json(participants);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin Route - Serves admin.html securely
app.get('/admin-dashboard-access-key-777', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Admin access: http://localhost:${PORT}/admin-dashboard-access-key-777`);
});
