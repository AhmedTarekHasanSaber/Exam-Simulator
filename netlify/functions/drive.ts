import { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  const action = event.queryStringParameters?.action;
  const folderId = "11pBU70shMYmBAw0lGEqd1h1nYK1hJiaG";
  
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Handle LIST operation
  if (action === 'list') {
    // Using embeddedfolderview which is more stable for scraping
    const folderUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
    try {
      const response = await fetch(folderUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });
      
      const html = await response.text();
      const files: { id: string; name: string }[] = [];
      
      // Pattern to match file entries in the embedded view
      // Looks for: ["ID", "Name.json"]
      const entryPattern = /\["([a-zA-Z0-9_-]{25,50})","([^"]+?\.json)"/g;
      
      let match;
      while ((match = entryPattern.exec(html)) !== null) {
        const id = match[1];
        let name = match[2];
        
        // Clean up name
        name = name
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
          .replace(/\\/g, '')
          .trim();

        if (!files.find(f => f.id === id)) {
           files.push({ id, name });
        }
      }

      // Fallback search in case the entry pattern misses
      if (files.length === 0) {
          const simpleIdPattern = /"([a-zA-Z0-9_-]{33})"/g;
          const simpleNamePattern = /"([^"]+?\.json)"/g;
          
          const ids: string[] = [];
          let idMatch;
          while ((idMatch = simpleIdPattern.exec(html)) !== null) ids.push(idMatch[1]);
          
          let nameMatch;
          while ((nameMatch = simpleNamePattern.exec(html)) !== null) {
              const name = nameMatch[1];
              // Try to find a nearby ID (very rough fallback)
              if (ids.length > 0) {
                  const id = ids.shift()!;
                  files.push({ id, name });
              }
          }
      }

      // Final Check: If still empty, add the TOGAF file manually as a guaranteed fallback
      if (files.length === 0) {
         files.push({ id: "1BL5KEGwY2qWyDTUBl_cpzE6YY3zN0IT1", name: "TOGAF® Super Mega.json" });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ files }),
      };
    } catch (error) {
      console.error("Scraper Error:", error);
      return { 
        statusCode: 200, // Return 200 with fallback even on error to prevent UI crash
        headers, 
        body: JSON.stringify({ 
            files: [{ id: "1BL5KEGwY2qWyDTUBl_cpzE6YY3zN0IT1", name: "TOGAF® Super Mega.json" }],
            warning: "Using fallback due to scraper error"
        }) 
      };
    }
  }

  // Handle DOWNLOAD operation
  if (action === 'download') {
    const fileId = event.queryStringParameters?.id;
    if (!fileId) return { statusCode: 400, headers, body: JSON.stringify({ error: "No ID provided" }) };
    
    const downloadUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
    try {
      const response = await fetch(downloadUrl);
      const text = await response.text();
      
      // Check if response is HTML (Google sometimes shows a "Virus Scan" warning page for large files)
      if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
          // This usually means we need to handle the "confirm" parameter for large files
          // But for JSON files this is rare. If it happens, we might need a more complex flow.
          // For now, let's try to return it and see if JSON.parse handles it
      }

      let finalBody;
      try {
        // Test if it's valid JSON
        JSON.parse(text);
        finalBody = text;
      } catch {
        // If not valid JSON, it might be the download confirmation page or error
        return { statusCode: 500, headers, body: JSON.stringify({ error: "File content is not valid JSON" }) };
      }

      return {
        statusCode: 200,
        headers,
        body: finalBody
      };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Download failed" }) };
    }
  }

  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ error: "Action not recognized" }),
  };
};
