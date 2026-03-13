exports.handler = async (event) => {
  // --- CRITICAL LOGGING ---
  // This will show up in your Netlify Function Logs the instant ANY request hits this file.
  const origin = event.headers.origin || event.headers.Origin || "No Origin";
  console.log(`[DEBUG] Function invoked. Method: ${event.httpMethod}, Origin: ${origin}`);
  console.log(`[DEBUG] Env Variable Key Present: ${!!process.env.GEMINI_API_KEY}`);

  // --- SECURITY LOCK ---
  const isAllowed = origin.endsWith(".netlify.app") || origin.includes("localhost") || origin === "No Origin";
  
  if (!isAllowed) {
    console.log(`[SECURITY] Blocked request from unauthorized origin: ${origin}`);
    return { statusCode: 403, body: JSON.stringify({ error: "Access Denied: Unauthorized Origin" }) };
  }

  // Handle preflight CORS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": origin === "No Origin" ? "*" : origin,
        "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // --- PARSE REQUEST ---
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { text, name, year, topic } = body;
  
  // Aggressive API Key Cleanup
  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"\s]/g, '').trim();

  if (!apiKey || apiKey.length < 20) {
    console.error("[ERROR] API Key is missing or invalid in Netlify settings.");
    return { 
      statusCode: 400, 
      headers: { "Access-Control-Allow-Origin": origin === "No Origin" ? "*" : origin, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "SERVER CONFIG ERROR: API Key missing in Netlify. Please check Environment Variables." }) 
    };
  }

  const systemInstruction = `You are an expert NAPLAN marking teacher. Grade the student's narrative text.
Criteria (Max Score): Audience (6), Text Structure (4), Ideas (5), Character & Setting (4), Vocabulary (5), Cohesion (4), Paragraphing (2), Sentence Structure (6), Punctuation (5), Spelling (6). Total out of 47.
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
}`;

  const userPrompt = `Student: ${name || 'Candidate'}\nYear: ${year || 'Unknown'}\nTopic: ${topic || 'Narrative'}\nText:\n${text}`;

  // Use v1beta for gemini-2.0-flash as it is the most robust endpoint for this model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    console.log(`[API] Calling Gemini 2.0 Flash...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error(`[GOOGLE ERROR] Status: ${response.status}, Message: ${data.error?.message}`);
        throw new Error(`Google API Error: ${data.error?.message || response.statusText}`);
    }

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("No response from AI");

    console.log("[SUCCESS] Report generated successfully.");
    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin === "No Origin" ? "*" : origin
      },
      body: resultText
    };

  } catch (error) {
    console.error("[RUNTIME ERROR]", error.message);
    return {
      statusCode: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin === "No Origin" ? "*" : origin
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
