const express = require('express');
const fetch = require('node-fetch');
const app = express();

const FMCSA_WEB_KEY = process.env.FMCSA_WEB_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RMIS_CLIENT_ID = process.env.RMIS_CLIENT_ID;
const RMIS_PASSWORD = process.env.RMIS_PASSWORD;

// ── FMCSA PROXY ──────────────────────────────────────────────
app.get('/fmcsa', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { dotNumber, endpoint } = req.query;
  if (!dotNumber) return res.status(400).json({ error: 'dotNumber required' });

  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}${endpoint ? '/' + endpoint : ''}?webKey=${FMCSA_WEB_KEY}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RMIS EXPANDED CARRIER API ─────────────────────────────────
app.get('/rmis/carrier', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { queryID, queryType } = req.query;
  if (!queryID) return res.status(400).json({ error: 'queryID required' });
  if (!queryType) return res.status(400).json({ error: 'queryType required (MC, DOT, or RMISID)' });

  const url = `https://api.rmissecure.com/_c/std/api/ExpandedCarrierAPI.aspx?clientID=${RMIS_CLIENT_ID}&password=${encodeURIComponent(RMIS_PASSWORD)}&QueryID=${queryID}&QueryType=${queryType}&Version=4`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RMIS NON-ATTACHED CARRIER API ────────────────────────────
app.get('/rmis/lookup', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { queryID, queryType } = req.query;
  if (!queryID) return res.status(400).json({ error: 'queryID required' });
  if (!queryType) return res.status(400).json({ error: 'queryType required (MC, DOT, or RMISID)' });

  const url = `https://api.rmissecure.com/_c/std/api/NonAttachedCarrierStatusRequestAPI.aspx?clientID=${RMIS_CLIENT_ID}&password=${encodeURIComponent(RMIS_PASSWORD)}&QueryID=${queryID}&QueryType=${queryType}&Version=4`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RMIS DOCUMENT API ─────────────────────────────────────────
app.get('/rmis/document', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { insdID, documentID, documentType } = req.query;
  if (!insdID) return res.status(400).json({ error: 'insdID required' });

  const url = `https://api.rmissecure.com/_c/std/api/DocumentAPI.aspx?clientID=${RMIS_CLIENT_ID}&password=${encodeURIComponent(RMIS_PASSWORD)}&insdID=${insdID}&documentID=${documentID || ''}&documentType=${documentType || 'COI'}&Version=4`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('DTS proxy server running');
});
