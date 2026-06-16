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
const PYLE_USER = process.env.PYLE_USER || 'dtsdispatch@dtsone.com';

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

// ── A. DUIE PYLE TRACKING PROXY ───────────────────────────────
// GET /pyle?token=...&type=0&value=716925383
app.get('/pyle', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, value, zip, partner } = req.query;
  if (!value) return res.status(400).json({ error: 'value required' });

  let url = `https://api.aduiepyle.com/2/shipment/status?user=${encodeURIComponent(PYLE_USER)}&type=${type || '0'}&value=${encodeURIComponent(value)}`;
  if (zip) url += `&zip=${encodeURIComponent(zip)}`;
  if (partner) url += `&partner=${encodeURIComponent(partner)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const text = await response.text();
    res.set('Content-Type', response.headers.get('content-type') || 'application/xml');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BEST OVERNITE (BTVP) TRACKING PROXY ──────────────────────
// POST /btvp?token=...
// Body: { proNumber: "450845060" }
app.post('/btvp', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { proNumber } = req.body;
  if (!proNumber) return res.status(400).json({ error: 'proNumber required' });

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://ttrackapi.wsbeans.iseries/">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:tracktrace>
      <arg0>
        <SECURITYINFO>
          <USERNAME>DTSONE</USERNAME>
          <PASSWORD>1928one</PASSWORD>
        </SECURITYINFO>
        <PRONUMBER>${proNumber}</PRONUMBER>
        <CURRENTSTATUS>
          <CONSIGNEE><ADDRESS1/><ADDRESS2/><CITY/><NAME/><STATE/><ZIP/></CONSIGNEE>
          <DELIVERYDATE/><ERRORCODE/><ESTDELIVERYDATE/><SHIPDATE/>
          <SHIPPER><ADDRESS1/><ADDRESS2/><CITY/><NAME/><STATE/><ZIP/></SHIPPER>
          <SIGNEDBY/><STATUS/>
        </CURRENTSTATUS>
        <HISTORY><DATE/><DESCRIPTION/><LOCATION/><TIME/></HISTORY>
        <HISTORYCOUNT>0</HISTORYCOUNT>
      </arg0>
    </tns:tracktrace>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const response = await fetch('http://tgif.bestovernite.com:10032/web/services/TTRACKAPIService/TTRACKAPI', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: soapBody
    });
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── CTBV (CustomCo/Carrier Logistics) TRACKING PROXY ─────────
// GET /ctbv?token=...&pronum=12345
app.get('/ctbv', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { pronum } = req.query;
  if (!pronum) return res.status(400).json({ error: 'pronum required' });

  const url = `https://factsweb.customco.com/protracexml.htm?xmluser=divtr02&xmlpass=Dts0ne!23@&pronum=${encodeURIComponent(pronum)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const text = await response.text();
    res.set('Content-Type', response.headers.get('content-type') || 'application/xml');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── NUMARK (NUMK) TRACKING PROXY ─────────────────────────────
// POST /numark?token=...
// Body: { proNumber: "12345" }
app.post('/numark', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { proNumber } = req.body;
  if (!proNumber) return res.status(400).json({ error: 'proNumber required' });

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://ttrackapi.wsbeans.iseries/xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <xsd:tracktrace>
      <xsd:args0>
        <xsd:PRONUMBER>${proNumber}</xsd:PRONUMBER>
        <xsd:SECURITYINFO>
          <xsd:PASSWORD>broker</xsd:PASSWORD>
          <xsd:USERNAME>DTSAPI</xsd:USERNAME>
        </xsd:SECURITYINFO>
      </xsd:args0>
    </xsd:tracktrace>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const response = await fetch('http://wsrq.numarkfreight.com:10044/web/services/TTrackAPIService/TTrackAPI', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: soapBody
    });
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── WSDL FETCH UTILITY ───────────────────────────────────────
// GET /wsdl?token=...&url=http://...
app.get('/wsdl', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const response = await fetch(url);
    const text = await response.text();
    res.set('Content-Type', 'text/xml');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── WARD TRANSPORT TRACKING PROXY ────────────────────────────
// POST /ward?token=...
// Body: { freightBill: "028-0741087", freightBillType: "WARDPRO" }
app.post('/ward', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { freightBill, freightBillType } = req.body;
  if (!freightBill) return res.status(400).json({ error: 'freightBill required' });

  const payload = {
    body: {
      request: {
        freightBill: freightBill,
        freightBillType: freightBillType || 'WARDPRO',
        bopoNumber: '',
        bopoNumberType: '',
        oZip: ''
      }
    }
  };

  try {
    const response = await fetch('https://wardtlctools.com/wardtrucking/webservices/traceshipmentv3', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ZHRzcWE6cWExOTgyOQ==',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── OAK HARBOR FREIGHT (OAKH) TRACKING PROXY ─────────────────
// POST /oakh?token=...
// Body: { proNumber: "12345678" }
app.post('/oakh', async (req, res) => {
  if (req.query.token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { proNumber } = req.body;
  if (!proNumber) return res.status(400).json({ error: 'proNumber required' });

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.oakh.com/services/soap?wsdl">
  <SOAP-ENV:Body>
    <ns1:getShipmentInfo>
      <pro>${proNumber}</pro>
    </ns1:getShipmentInfo>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  try {
    const response = await fetch('http://www.oakh.com/services/soap', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.oakh.com/services/soap#getShipmentInfo',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: soapBody
    });
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('DTS proxy server running');
});
