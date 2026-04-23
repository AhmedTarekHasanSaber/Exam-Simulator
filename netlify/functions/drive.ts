export const handler = async (event, context) => {
  const fullPath = event.path;
  const folderId = "11pBU70shMYmBAw0lGEqd1h1nYK1hJiaG";

  // Handle LIST operation
  if (fullPath.includes('/list')) {
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
    try {
      const response = await fetch(folderUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const html = await response.text();
      const files: any[] = [];
      const idPattern = /[a-zA-Z0-9_-]{28,45}/g;
      const jsonPattern = /[^"\\\[\]\n\r\t]+?\.json/gi;

      const idIndices: any[] = [];
      const foundNames: any[] = [];

      let idMatch;
      while ((idMatch = idPattern.exec(html)) !== null) {
        idIndices.push({ id: idMatch[0], index: idMatch.index });
      }

      let nameMatch;
      while ((nameMatch = jsonPattern.exec(html)) !== null) {
        let name = nameMatch[0]
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
          .replace(/\\x22/g, '').replace(/x22/g, '').replace(/&quot;/g, '').replace(/\\/g, '').replace(/^[^a-zA-Z0-9]+/, '').trim();

        if (name.length > 5 && !name.includes('manifest.json')) {
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
         files.push({ id: "1BL5KEGwY2qWyDTUBl_cpzE6YY3zN0IT1", name: "TOGAF® Foundation.json" });
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      };
    } catch (error: any) {
      return { statusCode: 500, body: JSON.stringify({ error: "Scrape failed", msg: error.message }) };
    }
  }

  // Handle DOWNLOAD operation
  if (fullPath.includes('/download/')) {
    const fileId = fullPath.split('/').pop();
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    try {
      const response = await fetch(downloadUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      let text = await response.text();

      // Simple virus scan bypass
      if (text.includes('confirm=')) {
        const confirmMatch = text.match(/confirm=([a-zA-Z0-9_-]+)/);
        if (confirmMatch) {
          const res2 = await fetch(`${downloadUrl}&confirm=${confirmMatch[1]}`, { headers: { "User-Agent": "Mozilla/5.0" } });
          text = await res2.text();
        }
      }

      const data = JSON.parse(text);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(data),
      };
    } catch (error: any) {
      return { statusCode: 500, body: JSON.stringify({ error: "Download failed", msg: error.message, preview: text?.substring(0, 50) }) };
    }
  }

  return { statusCode: 404, body: JSON.stringify({ error: "Not Found", path: fullPath }) };
};
