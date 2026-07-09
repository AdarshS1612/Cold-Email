const nodemailer = require('nodemailer');

async function sendColdEmail({ to, subject, body, gmailUser, gmailAppPassword, senderName, resumeBase64, resumeName }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  const mailOptions = {
    from: `${senderName || 'Applicant'} <${gmailUser}>`,
    to, subject,
    text: body,
    html: `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${body}</pre>`,
  };

  if (resumeBase64) {
    mailOptions.attachments = [{
      filename: resumeName || 'Resume.pdf',
      content:  resumeBase64,
      encoding: 'base64',
    }];
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId, accepted: info.accepted };
}

module.exports = { sendColdEmail };
