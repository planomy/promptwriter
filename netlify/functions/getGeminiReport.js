const fetch = require('node-fetch');

exports.handler = async (event) => {
  // 1. CORS & Method Guard
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 2. Parse Input
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { text, name, year, topic } = body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "API Key missing in server environment." }) };
  }

  // 3. System Instructions for NAPLAN Marking
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

  // 4. Call Gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });

    const data = await response.json();
    
    // Extract the text from Gemini response
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("No response from AI");

    // Return the JSON directly to the frontend
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: resultText
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
