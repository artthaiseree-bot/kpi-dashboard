const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { readExcelData } = require('./excelReader');
const { processAndValidateData } = require('./dataProcessor');
const { initFileWatcher } = require('./fileWatcher');

const app = express();
app.use(cors());
app.use(express.json());

let config = { port: 3000, excelPath: './data/20261119_KPI_2026.xlsx' };
if (fs.existsSync('./config.json')) {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
}

app.use(express.static(path.join(__dirname, '../frontend')));

let cachedData = { records: [], errors: [], duplicates: [] };
let lastUpdatedTime = new Date().toISOString();
let connectionStatus = 'Connected';

function loadData() {
  try {
    connectionStatus = 'Updating';
    const raw = readExcelData(config.excelPath);
    const processed = processAndValidateData(raw);
    cachedData = processed;
    lastUpdatedTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    connectionStatus = 'Updated Successfully';
  } catch (err) {
    connectionStatus = 'Connection Error';
    console.error(err);
  }
}

loadData();

let sseClients = [];
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter(c => res !== c); });
});

function broadcastUpdate() {
  loadData();
  sseClients.forEach(client => {
    client.write(`data: ${JSON.stringify({ status: connectionStatus, lastUpdated: lastUpdatedTime })}\n\n`);
  });
}

try { initFileWatcher(config.excelPath, broadcastUpdate); } catch (e) {}

app.get('/api/data', (req, res) => {
  res.json({
    status: connectionStatus,
    lastUpdated: lastUpdatedTime,
    data: cachedData.records,
    errors: cachedData.errors,
    duplicates: cachedData.duplicates
  });
});

app.post('/api/refresh', (req, res) => {
  loadData();
  res.json({ success: true, status: connectionStatus, lastUpdated: lastUpdatedTime });
});

app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});