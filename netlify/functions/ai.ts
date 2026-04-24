import { GoogleGenAI } from "@google/genai";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { base64Data, promptText } = JSON.parse(event.body);
    
    if (!process.env.GEMINI_API_KEY) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "GEMINI_API_KEY is not set in Netlify environment" }) 
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64Data } },
          { text: promptText }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: response.text })
    };
  } catch (error: any) {
    console.error("AI Generation Function Error:", error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "AI Generation Failed", message: error.message }) 
    };
  }
};
