exports.handler = async (event) => {
  // --- SECURITY LOCK ---
  // Replace this with your exact Netlify website URL if it changes
  const ALLOWED_ORIGIN = "https://promptwriter.netlify.app"; 
  const origin = event.headers.origin || event.headers.Origin;
  
  if (origin && origin !== ALLOWED_ORIGIN) {
    return { statusCode: 403, body: JSON.stringify({ error: "Access Denied: Invalid Origin" }) };
  }

  // Handle preflight CORS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
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
  
  // FIX: Extremely aggressive cleanup of the API Key
  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"\s]/g, '');

  // TRIPWIRE: If the key is blank or too short, stop immediately and alert the user
  if (!apiKey || apiKey.length < 20) {
    return { 
      statusCode: 400, 
      headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ error: `NETLIFY CONFIG ERROR: The server cannot see your API Key. It is completely blank. Please check your Netlify Environment Variables and click 'Trigger Deploy'.` }) 
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  let response;
  let retries = 3;
  let delay = 2000; 

  try {
    for (let i = 0; i < retries; i++) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        })
      });

      if (response.status === 429) {
        if (i === retries - 1) {
          throw new Error("Too many students are submitting at once. Please wait a moment and click get marking again.");
        }
        await new Promise(res => setTimeout(res, delay));
        delay *= 2; 
      } else {
        break; 
      }
    }

    const data = await response.json();
    
    // Improved Error Logging for Google API Failures
    if (!response.ok) {
        const maskedKey = `${apiKey.substring(0, 5)}...`;
        throw new Error(`Google API Error (Using key ${maskedKey}): ${data.error?.message || response.statusText}`);
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
