const express = require('express');
const fetch = require('node-fetch');
const app = express();

const FMCSA_WEB_KEY = process.env.FMCSA_WEB_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

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

app.listen(process.env.PORT || 3000, () => {
  console.log('FMCSA proxy running');
});
