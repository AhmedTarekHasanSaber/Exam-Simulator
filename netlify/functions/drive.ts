import { Handler } from "@netlify/functions";

export const handler: Handler = async (event, context) => {
  const fullPath = event.path;
  const isList = fullPath.endsWith('/list');
  const isDownload = fullPath.includes('/download/');
  const folderId = "11pBU70shMYmBAw0lGEqd1h1nYK1hJiaG";

  // Handle LIST operation
  if (isList) {
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

      // TOGAF Fallback
      if (files.length === 0 && html.includes("TOGAF")) {
         files.push({ id: "1BL5KEGwY2qWyDTUBl_cpzE6YY3zN0IT1", name: "TOGAF® Super Mega.json" });
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ files }),
      };
    } catch (error) {
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to scrape" }) };
    }
  }

  // Handle DOWNLOAD operation
  if (isDownload) {
    const fileId = fullPath.split('/').pop();
    // Try primary download link
    const downloadUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
    
    try {
      let response = await fetch(downloadUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      });

      let text = await response.text();

      // Check if we hit the Google virus scan warning page
      if (text.includes('confirm=') && text.includes('drive.google.com/uc')) {
        const confirmMatch = text.match(/confirm=([a-zA-Z0-9_-]+)/);
        if (confirmMatch) {
          const confirmToken = confirmMatch[1];
          const secondResponse = await fetch(`${downloadUrl}&confirm=${confirmToken}`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            },
          });
          text = await secondResponse.text();
        }
      }

      const data = JSON.parse(text);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      };
    } catch (error) {
      console.error("Netlify Function Download Error:", error);
      return { statusCode: 500, body: JSON.stringify({ error: "Download failed or file not JSON" }) };
    }
  }

  return {
    statusCode: 404,
    body: "Not Found",
  };
};
