exports.handler = async (event) => {
  // --- SECURITY LOCK ---
  const ALLOWED_ORIGIN = "https://promptwriter.netlify.app"; 
  const origin = event.headers.origin || event.headers.Origin;
  
  if (origin && origin !== ALLOWED_ORIGIN) {
    return { statusCode: 403, body: JSON.stringify({ error: "Access Denied: Invalid Origin" }) };
  }

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { text, name, year, topic } = body;
  
  // Clean the key from any accidental junk
  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"\s]/g, '').trim();

  if (!apiKey || apiKey.length < 20) {
    return { 
      statusCode: 400, 
      headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "SERVER ERROR: API Key is missing or invalid in Netlify settings." }) 
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

  const userPrompt = `Student: ${name || 'Unknown'}\nYear: ${year || 'Unknown'}\nTopic: ${topic || 'Unknown'}\nText:\n${text}`;

  // UPDATED: Using gemini-2.0-flash for maximum request limits and performance
  // v1beta is required for the 2.0 series
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // DUAL INJECTION: Sending key in both header AND URL to force identity recognition
        'x-goog-api-key': apiKey 
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(`Google API Error: ${data.error?.message || response.statusText}`);
    }

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("No response from AI");

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN 
      },
      body: resultText
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN 
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
