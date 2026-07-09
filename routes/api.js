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
