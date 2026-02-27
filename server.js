const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Status endpoint for frontend detection
app.get('/api/status', (req, res) => {
    res.json({ 
        online: true, 
        cwd: process.cwd(), 
        os: process.platform,
        version: "2.7.0-LOCAL"
    });
});

// Shell execution endpoint (POWERSHELL/CMD)
app.post('/api/shell', (req, res) => {
    const { command, cwd } = req.body;
    
    if (!command) return res.status(400).json({ error: "No command provided" });
    
    console.log(`[GIT-CHAT-LOCAL] Executing: ${command}`);
    
    // Default to the project root or the specified relative path
    const execCwd = cwd ? (path.isAbsolute(cwd) ? cwd : path.join(process.cwd(), cwd)) : process.cwd();

    // Use powershell on windows for better compatibility with standard commands
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';

    exec(command, { cwd: execCwd, shell: shell }, (error, stdout, stderr) => {
        const response = {
            stdout: stdout || "",
            stderr: stderr || "",
            error: error ? error.message : null,
            exitCode: error ? error.code : 0
        };
        
        console.log(`[GIT-CHAT-LOCAL] Done. Exit code: ${response.exitCode}`);
        res.json(response);
    });
});

app.listen(PORT, 'localhost', () => {
    console.log(`\n=================================================`);
    console.log(`🚀 GitChat Local Server running at http://localhost:${PORT}`);
    console.log(`💻 OS: ${process.platform} | CWD: ${process.cwd()}`);
    console.log(`🔧 Terminal access for GitChat is now ACTIVE.`);
    console.log(`=================================================\n`);
    console.log(`Press Ctrl+C to stop the server.\n`);
});
