const Groq = require('groq-sdk');

function getClient(apiKey) {
  if (!apiKey) {
    throw new Error('Groq API key not configured. Add it in Settings.');
  }
  return new Groq({ apiKey });
}

async function ask(systemPrompt, userPrompt, apiKey) {
  const completion = await getClient(apiKey).chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    temperature: 0.6,
  });
  return completion.choices[0].message.content.trim();
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function extractJobDetails(jobText, apiKey) {
  const system = `You are a precise data extraction assistant. Extract structured information from job postings. Return ONLY valid JSON — no markdown, no explanation.`;

  const user = `Extract details from this job post and return this exact JSON:
{
  "jobTitle": "exact job title from the post",
  "company": "company name",
  "recruiterName": "recruiter or HR name if explicitly mentioned, else null",
  "hrEmail": "email address if present in the post, else null",
  "location": "city/country or Remote, else null",
  "keyRequirements": ["top 4-5 must-have skills or technologies"],
  "jobSummary": "1-2 sentence factual summary of the role and team"
}

Job Post:
"""
${jobText}
"""`;

  return parseJSON(await ask(system, user, apiKey));
}

async function generateColdEmail(jobDetails, resumeText, appInfo = {}, apiKey) {
  const { name, phone, notice, currentCtc, expectedCtc, lwd } = appInfo;

  // Build candidate info block — use placeholder when value is missing
  const candidateName = name || '{{YOUR_NAME}}';
  const infoLines = [
    `Current CTC: ${currentCtc  || '{{CURRENT_CTC}}'}`,
    `Expected CTC: ${expectedCtc || '{{EXPECTED_CTC}}'}`,
    `Notice Period: ${notice     || '{{NOTICE_PERIOD}}'}`,
    `Contact: ${phone            || '{{PHONE_NUMBER}}'}`,
    lwd ? `Last Working Day: ${lwd}` : null,
  ].filter(Boolean);

  const recruiter = (jobDetails.recruiterName && jobDetails.recruiterName !== 'null')
    ? jobDetails.recruiterName.trim()
    : null;
  const greeting = recruiter ? `Hi ${recruiter.split(' ')[0]},` : 'Hi Hiring Team,';

  const system = `You are an expert technical recruiter communication assistant. You write highly professional job application emails that sound like a real human wrote them — never AI-generated, never generic.

Rules you always follow:
- Maximum 180 words unless more detail is explicitly needed.
- Professional, concise, natural human tone.
- No unnecessary adjectives or filler phrases.
- Never hallucinate experience, skills, or numbers not present in the resume.
- Never mention technologies not found in the job description.
- Never use: "esteemed", "honored", "thrilled", "passionate", "I am writing to", "I believe I am a great fit", "leverage", "synergy", "innovative solutions".
- No emojis.
- Return ONLY valid JSON — no markdown fences, no explanation.`;

  const user = `Write a cold job application email using the candidate info and job details below.

--- JOB DETAILS ---
Job Title: ${jobDetails.jobTitle}
Company: ${jobDetails.company}
Location: ${jobDetails.location || 'Not specified'}
Job Summary: ${jobDetails.jobSummary || ''}
Key Requirements: ${(jobDetails.keyRequirements || []).join(', ')}

--- CANDIDATE RESUME ---
"""
${resumeText}
"""

--- CANDIDATE DETAILS ---
Name: ${candidateName}
${infoLines.join('\n')}

--- EMAIL STRUCTURE ---
Greeting: "${greeting}"

Paragraph 1 (1 sentence): Express interest in the ${jobDetails.jobTitle} role. Mention one specific thing ${jobDetails.company} does or is known for (from the job summary). Do NOT start with "I".

Paragraph 2 (2-3 sentences): Pick the 2-3 most relevant achievements from the resume that match the key requirements. Use exact numbers from the resume only. Never invent stats.

Candidate info block — ALWAYS include as bullet points, exactly as given:
${infoLines.map(l => `• ${l}`).join('\n')}

Closing (1 sentence): Politely request a brief call or interview.

Sign-off:
Best Regards,
${candidateName}

--- SUBJECT LINE RULES ---
Format: "Application for ${jobDetails.jobTitle}"
If candidate name is known: "Application for ${jobDetails.jobTitle} – ${candidateName}"

Return exactly this JSON:
{
  "subject": "subject line",
  "body": "complete email body with \\n for line breaks"
}`;

  return parseJSON(await ask(system, user, apiKey));
}

module.exports = { extractJobDetails, generateColdEmail };
