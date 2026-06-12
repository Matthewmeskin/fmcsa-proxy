const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const FMCSA_WEB_KEY = process.env.FMCSA_WEB_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RMIS_CLIENT_ID = process.env.RMIS_CLIENT_ID;
const RMIS_PASSWORD = process.env.RMIS_PASSWORD;
const FEDEX_CLIENT_ID = process.env.FEDEX_CLIENT_ID;
const FEDEX_CLIENT_SECRET = process.env.FEDEX_CLIENT_SECRET;

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
  if (!queryType) return res.status(400).json({ error: 'queryType required (MC, DOT, or INSDID)' });

  const url = `https://api.rmissecure.com/_c/std/api/ExpandedCarrierAPI.aspx?clientID=${RMIS_CLIENT_ID}&pwd=${encodeURIComponent(RMIS_PASSWORD)}&querytype=${queryType}&queryid=${queryID}&version=13`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
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
  if (!queryType) return res.status(400).json({ error: 'queryType required (MC, DOT, or INSDID)' });

  const url = `https://api.rmissecure.com/_c/std/api/NonAttachedCarrierStatusRequestAPI.aspx?clientID=${RMIS_CLIENT_ID}&pwd=${encodeURIComponent(RMIS_PASSWORD)}&querytype=${queryType}&queryid=${queryID}&version=13`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
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

  const url = `https://api.rmissecure.com/_c/std/api/DocumentAPI.aspx?clientID=${RMIS_CLIENT_ID}&pwd=${encodeURIComponent(RMIS_PASSWORD)}&insdID=${insdID}&documentID=${documentID || ''}&documentType=${documentType || 'COI'}&version=13`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FEDEX FREIGHT - OAuth Token ───────────────────────────────
// POST /fedex/token
// No body required — uses env vars FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET
app.post('/fedex/token', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const clientId = FEDEX_CLIENT_ID;
  const clientSecret = FEDEX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'FedEx credentials not configured on proxy' });
  }

  try {
    const response = await fetch('https://apis.fedex.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FEDEX FREIGHT - Track by Tracking Number ──────────────────
// POST /fedex/track
// Body: { accessToken: string, trackingInfo: [{ trackingNumber: string, carrierCode: string }] }
app.post('/fedex/track', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { accessToken, trackingInfo } = req.body;
  if (!accessToken) return res.status(400).json({ error: 'accessToken required in body' });
  if (!trackingInfo || !Array.isArray(trackingInfo) || trackingInfo.length === 0) {
    return res.status(400).json({ error: 'trackingInfo array required in body' });
  }

  try {
    const response = await fetch('https://apis.fedex.com/track/v1/trackingnumbers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'x-locale': 'en_US'
      },
      body: JSON.stringify({
        includeDetailedScans: false,
        trackingInfo: trackingInfo.map(t => ({
          trackNumberInfo: {
            trackingNumber: t.trackingNumber,
            carrierCode: t.carrierCode || 'FXFR'
          }
        }))
      })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('DTS proxy server running');
});
