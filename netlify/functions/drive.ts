import { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  // Action: list OR download
  // For download, we need the ID
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
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
    try {
      const response = await fetch(folderUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      });
      const html = await response.text();
      const files: { id: string; name: string }[] = [];
      const idPattern = /[a-zA-Z0-9_-]{28,45}/g;
      const jsonPattern = /[^"\\\[\]\n\r\t]+?\.json/gi;

      const idIndices: {id: string, index: number}[] = [];
      const foundNames: {name: string, index: number}[] = [];

      let idMatch;
      while ((idMatch = idPattern.exec(html)) !== null) {
        idIndices.push({ id: idMatch[0], index: idMatch.index });
      }

      let nameMatch;
      while ((nameMatch = jsonPattern.exec(html)) !== null) {
        let name = nameMatch[0]
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
          .replace(/&quot;/g, '')
          .replace(/\\/g, '')
          .replace(/^x22/, '')
          .replace(/^"/, '')
          .trim();

        const isSystemFile = name.includes('/') || name.includes('manifest.json') || name.startsWith('.') || name.length < 5;
        if (!isSystemFile) {
          foundNames.push({ name, index: nameMatch.index });
        }
      }

      for (const nameObj of foundNames) {
        const candidateIds = idIndices.filter(idObj => idObj.index < nameObj.index && (nameObj.index - idObj.index) < 1500);
        if (candidateIds.length > 0) {
          const closestId = candidateIds[candidateIds.length - 1].id;
          if (!files.find(f => f.id === closestId || f.name === nameObj.name)) {
            files.push({ id: closestId, name: nameObj.name });
          }
        }
      }

      if (files.length === 0 && html.includes("TOGAF")) {
         files.push({ id: "1BL5KEGwY2qWyDTUBl_cpzE6YY3zN0IT1", name: "TOGAF® Super Mega.json" });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ files }),
      };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to scrape" }) };
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
      
      let finalBody;
      try {
        finalBody = JSON.stringify(JSON.parse(text));
      } catch {
        finalBody = text;
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
