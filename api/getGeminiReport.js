export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.Origin || "No Origin";

  console.log(`[DEBUG] Function invoked. Method: ${req.method}, Origin: ${origin}`);
  console.log(`[DEBUG] Env Variable Key Present: ${!!process.env.GEMINI_API_KEY}`);

  const isAllowed =
    origin === "No Origin" ||
    origin.includes("localhost") ||
    origin.endsWith(".vercel.app") ||
    origin.endsWith(".netlify.app");

  const allowOrigin = origin === "No Origin" ? "*" : origin;

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-goog-api-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (!isAllowed) {
    console.log(`[SECURITY] Blocked request from unauthorized origin: ${origin}`);
    return res.status(403).json({ error: "Access Denied: Unauthorized Origin" });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body = req.body || {};
  const { text, name, year, topic } = body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing or invalid student text." });
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"\s]/g, "").trim();

  if (!apiKey || apiKey.length < 20) {
    console.error("[ERROR] API Key is missing or invalid in Vercel settings.");
    return res.status(500).json({
      error: "SERVER CONFIG ERROR: API Key missing in Vercel Environment Variables."
    });
  }

  const systemInstruction = `You are an expert Australian NAPLAN narrative marker and experienced English teacher.
The student is in Year ${year}. Adjust expectations appropriately for this year level.
Assess the student's narrative carefully and score it using these criteria:
Audience (6), Text Structure (4), Ideas (5), Character & Setting (4), Vocabulary (5), Cohesion (4), Paragraphing (2), Sentence Structure (6), Punctuation (5), Spelling (6). Total out of 47.

MARKING INSTRUCTIONS:
- Judge the writing honestly and conservatively.
- Base all scores on the student's actual writing, not on intention.
- Do not give inflated praise.
- Identify specific strengths and specific weaknesses.
- Feedback must be clear, practical, and tied to the student's actual writing.
- Do NOT rewrite the student's story.
- Do NOT invent errors that are not present.
- If there are awkward, confusing, or incorrect sentences, say so directly.
- If punctuation errors affect clarity, reduce the relevant score.
- If ideas are clear but development is limited, do not award full marks.
- If cohesion is weakened by jumps in time, repetition, or clumsy sequencing, say so.
- If vocabulary is ambitious but awkward or unnatural, mention both the strength and the weakness.
- If sentence structure includes comma splices, run-ons, fragments, or overloaded clauses, mention this explicitly.
- If spelling or apostrophe use is incorrect, mention the actual word or type of error.

FOR EACH CRITERION:
- Give a score within the allowed range.
- Write 1-3 sentences of feedback.
- Feedback should explain why the score was given.
- Use brief quotations from the student's writing where helpful.
- Be supportive, but specific and honest.

FOR THE IMPROVEMENT COMMENT:
- Write one short paragraph.
- Start with one genuine strength.
- Then identify the 2-3 most important writing issues to fix.
- Focus on the issues that would most improve the student's result.
- Give practical advice, not vague praise.

SCORING GUIDANCE:
- Full marks should be rare and only used when the criterion is extremely strong.
- Mid-range scores should be used when writing is competent but has noticeable flaws.
- Lower scores should be used when control is inconsistent or errors interfere with meaning.

Return ONLY valid JSON in this exact shape:
{
  "totalScore": 0,
  "improvementComment": "",
  "criteria": [
    {"name":"Audience","score":0,"maxScore":6,"feedback":""},
    {"name":"Text Structure","score":0,"maxScore":4,"feedback":""},
    {"name":"Ideas","score":0,"maxScore":5,"feedback":""},
    {"name":"Character & Setting","score":0,"maxScore":4,"feedback":""},
    {"name":"Vocabulary","score":0,"maxScore":5,"feedback":""},
    {"name":"Cohesion","score":0,"maxScore":4,"feedback":""},
    {"name":"Paragraphing","score":0,"maxScore":2,"feedback":""},
    {"name":"Sentence Structure","score":0,"maxScore":6,"feedback":""},
    {"name":"Punctuation","score":0,"maxScore":5,"feedback":""},
    {"name":"Spelling","score":0,"maxScore":6,"feedback":""}
  ]
}

Do not include markdown.
Do not include explanation outside the JSON.
Do not include trailing commas.
The totalScore must equal the sum of all criterion scores.`;

  const userPrompt = `Student: ${name || "Candidate"}
Year: ${year || "Unknown"}
Topic: ${topic || "Narrative"}
Text:
${text}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    console.log("[API] Calling Gemini 2.5 Flash...");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[GOOGLE ERROR] Status: ${response.status}, Message: ${data.error?.message}`);
      throw new Error(`Google API Error: ${data.error?.message || response.statusText}`);
    }

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error("No response from AI");
    }

    console.log("[SUCCESS] Report generated successfully.");

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(resultText);
  } catch (error) {
    console.error("[RUNTIME ERROR]", error.message);
    return res.status(500).json({ error: error.message });
  }
}
