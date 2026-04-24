export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { base64Data, promptText } = await request.json();
    // @ts-ignore: Netlify global in Deno environment
    const rawApiKey = typeof Netlify !== "undefined" ? Netlify.env.get("GEMINI_API_KEY") : Deno.env.get("GEMINI_API_KEY");
    const apiKey = rawApiKey?.trim();
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not found in environment" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const payload = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: "application/pdf", data: base64Data } },
            { text: promptText }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Gemini API Error";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch (e) {}
      
      return new Response(JSON.stringify({ error: errorMessage, details: errorText }), { 
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return new Response(JSON.stringify({ text }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Edge Function Error", message: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/api/ai/generate" };
