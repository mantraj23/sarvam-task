import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import speak from "./api/speak.js";
import transcribe from "./api/transcribe.js";

const routes = { "/api/speak": speak, "/api/transcribe": transcribe };
const files = { "/": ["index.html", "text/html"], "/app.js": ["app.js", "text/javascript"], "/survey.js": ["survey.js", "text/javascript"], "/styles.css": ["styles.css", "text/css"] };

createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  res.setHeader("Cache-Control", "no-store");
  try {
    if (routes[path]) {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 3_700_000) { res.writeHead(413); res.end("Answer too large"); return; }
        chunks.push(chunk);
      }
      try { req.body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
      catch { res.writeHead(400); res.end("Invalid JSON"); return; }
      return await routes[path](req, res);
    }
    if (!files[path]) { res.writeHead(404); res.end("Not found"); return; }
    const [file, mime] = files[path];
    const content = await readFile(new URL(`./public/${file}`, import.meta.url));
    res.writeHead(200, { "Content-Type": `${mime}; charset=utf-8` });
    res.end(content);
  } catch { res.writeHead(500); res.end("Unable to serve this request."); }
}).listen(3000, "127.0.0.1", () => console.log("Survey studio: http://localhost:3000"));
