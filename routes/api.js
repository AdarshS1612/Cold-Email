const express    = require('express');
const pdfParse   = require('pdf-parse');
const { extractJobDetails, generateColdEmail } = require('../services/groqService');
const { sendColdEmail } = require('../services/emailService');

const router = express.Router();

// POST /api/extract — uses Groq to extract job details from pasted text
router.post('/extract', async (req, res) => {
  const { jobText, groqApiKey } = req.body;
  if (!jobText?.trim() || jobText.trim().length < 50)
    return res.status(400).json({ error: 'Paste a full job description (at least 50 characters).' });
  if (!groqApiKey)
    return res.status(400).json({ error: 'Groq API key not configured. Add it in Settings.' });
  try {
    res.json(await extractJobDetails(jobText, groqApiKey));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate — uses Groq to write the cold email
router.post('/generate', async (req, res) => {
  const { jobDetails, resumeText, appInfo, groqApiKey } = req.body;
  if (!jobDetails || !resumeText)
    return res.status(400).json({ error: 'jobDetails and resumeText are required.' });
  if (!groqApiKey)
    return res.status(400).json({ error: 'Groq API key not configured. Add it in Settings.' });
  try {
    res.json(await generateColdEmail(jobDetails, resumeText, appInfo || {}, groqApiKey));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/send — sends email via Nodemailer (Gmail App Password)
router.post('/send', async (req, res) => {
  const { to, subject, body, resumeBase64, resumeName, gmailUser, gmailAppPassword, senderName } = req.body;
  if (!to || !subject || !body)
    return res.status(400).json({ error: 'to, subject and body are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    return res.status(400).json({ error: 'Invalid recipient email address.' });

  if (!gmailUser || !gmailAppPassword)
    return res.status(400).json({ error: 'Gmail not configured — add your Gmail address and App Password in Settings.' });

  try {
    const result = await sendColdEmail({
      to, subject, body,
      gmailUser,
      gmailAppPassword,
      senderName:   senderName || 'Applicant',
      resumeBase64: resumeBase64 || null,
      resumeName:   resumeName  || 'Resume.pdf',
    });
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fetch-job — fetches a LinkedIn job page and returns plain text
router.post('/fetch-job', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes('linkedin.com'))
    return res.status(400).json({ error: 'A valid LinkedIn URL is required.' });

  try {
    const https   = require('https');
    const http    = require('http');
    const { URL } = require('url');

    const fetchUrl = (targetUrl, redirects = 0) => new Promise((resolve, reject) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const parsed  = new URL(targetUrl);
      const client  = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
        }
      };
      client.get(options, r => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location)
          return resolve(fetchUrl(r.headers.location, redirects + 1));
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => resolve(data));
      }).on('error', reject);
    });

    const html = await fetchUrl(url);

    // Try JSON-LD structured data first (most reliable)
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        const desc = ld.description || ld.responsibilities || '';
        if (desc.length > 100) {
          const clean = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const title = ld.title ? `${ld.title} at ${ld.hiringOrganization?.name || ''}\n\n` : '';
          return res.json({ text: (title + clean).substring(0, 6000) });
        }
      } catch {}
    }

    // Fallback: strip all HTML tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length < 100)
      return res.status(422).json({ error: 'LinkedIn blocked this request. Please copy the job description text manually and paste it below.' });

    res.json({ text: text.substring(0, 6000) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch the job post. Copy the text manually and paste it below.' });
  }
});

// POST /api/parse-resume — accepts base64 PDF, returns plain text
router.post('/parse-resume', async (req, res) => {
  const { base64 } = req.body;
  if (!base64) return res.status(400).json({ error: 'base64 is required.' });
  try {
    const buf    = Buffer.from(base64, 'base64');
    const result = await pdfParse(buf);
    res.json({ text: result.text.trim().substring(0, 4000) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
});

module.exports = router;
