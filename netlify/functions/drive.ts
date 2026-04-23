import { Handler } from "@netlify/functions";

export const handler: Handler = async (event, context) => {
  const fullPath = event.path;
  const folderId = "11pBU70shMYmBAw0lGEqd1h1nYK1hJiaG";

  // Handle LIST operation
  if (fullPath.includes('/list')) {
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
          .replace(/\\x22/g, '') // Remove hex double quotes
          .replace(/x22/g, '')   // Remove literal x22
          .replace(/&quot;/g, '')
          .replace(/\\/g, '')
          .replace(/^[^a-zA-Z0-9]+/, '') 
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

      // TOGAF Fallback
      if (files.length === 0 && html.includes("TOGAF")) {
         files.push({ id: "1BL5KEGwY2qWyDTUBl_cpzE6YY3zN0IT1", name: "TOGAF® Super Mega.json" });
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      };
    } catch (error: any) {
      return { statusCode: 500, body: JSON.stringify({ error: "Scrape failed", details: error.message }) };
    }
  }

  // Handle DOWNLOAD operation
  if (fullPath.includes('/download/')) {
    const fileId = fullPath.split('/download/').pop()?.split('?')[0];
    if (!fileId || fileId.length < 20) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid File ID", path: fullPath }) };
    }

    // Try multiple download strategies
    const strategies = [
      `https://drive.google.com/uc?id=${fileId}&export=download`,
      `https://docs.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/file/d/${fileId}/view`
    ];
    
    let lastError = "";

    for (const downloadUrl of strategies) {
      try {
        const headers = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        };

        let response = await fetch(downloadUrl, { headers });
        let text = await response.text();

        // 1. Handle Virus Scan Confirmation
        if (text.length < 15000 && text.includes('confirm=')) {
          const confirmMatch = text.match(/confirm=([a-zA-Z0-9_-]+)/);
          if (confirmMatch) {
            const confirmToken = confirmMatch[1];
            const sep = downloadUrl.includes('?') ? '&' : '?';
            const secondResponse = await fetch(`${downloadUrl}${sep}confirm=${confirmToken}`, { headers });
            text = await secondResponse.text();
          }
        }

        // 2. Handle cases where content is inside a script tag (web view fallback)
        if (downloadUrl.endsWith('/view') && !text.trim().startsWith('{')) {
           const jsonMatch = text.match(/_docs_items_json\s*=\s*'([^']+)'/);
           if (jsonMatch) {
              text = jsonMatch[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
           }
        }

        const cleanedText = text.trim();
        let jsonData = null;

        if (cleanedText.startsWith('{') || cleanedText.startsWith('[')) {
          try {
            jsonData = JSON.parse(cleanedText);
          } catch (e) {
            lastError = "JSON Parse failed via direct text";
          }
        }

        // Strategy Fallback: Scrape from Web View if it's the "view" URL or if direct failed but it smells like a preview page
        if (!jsonData && (downloadUrl.endsWith('/view') || text.includes('_docs_items_json'))) {
          const jsonMatch = text.match(/_docs_items_json\s*=\s*'([^']+)'/);
          if (jsonMatch) {
            try {
              const rawJson = jsonMatch[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
              jsonData = JSON.parse(rawJson);
            } catch (e) {
              lastError = "JSON Parse failed from web view scrape";
            }
          }
        }

        if (jsonData && jsonData.questionBank) {
          return {
            statusCode: 200,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify(jsonData),
          };
        }
        const jsonPreview = jsonData ? JSON.stringify(jsonData).substring(0, 100) : "NULL";
        lastError = `JSON valid but NO questionBank. Preview: ${jsonPreview}`;
      } catch (error: any) {
        lastError = error.message;
      }
    }

    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "All download strategies failed", lastError, path: fullPath }) 
    };
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Not Found", path: fullPath }),
  };
};
