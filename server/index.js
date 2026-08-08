// Local API the dashboard calls to run decision cycles.
//
// Why a server at all: the agents need private keys and an LLM API key. Running
// them in the browser would ship both to every visitor. So the browser asks,
// the server acts, and the reasoning transcript comes back for display.
//
// Run: npm run server   (default port 8787)

require("dotenv").config({ quiet: true });
const http = require("http");
const { runCycle } = require("./cycle");

const PORT = process.env.GUARDIAN_API_PORT || 8787;

// One cycle at a time. Concurrent cycles would interleave transactions from the
// same agent addresses and produce nonce collisions.
let running = false;
let lastTranscript = null;

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/health") {
    return send(res, 200, { ok: true, running });
  }

  if (url.pathname === "/api/transcript") {
    return send(res, 200, { transcript: lastTranscript, running });
  }

  if (url.pathname === "/api/cycle" && req.method === "POST") {
    if (running) return send(res, 409, { error: "A cycle is already running." });

    const injected = url.searchParams.get("inject") === "1";
    running = true;

    try {
      lastTranscript = await runCycle({ injected });
      return send(res, 200, { transcript: lastTranscript });
    } catch (err) {
      const failure = {
        startedAt: new Date().toISOString(),
        injected,
        failed: true,
        error: err.message,
        steps: [],
      };
      lastTranscript = failure;
      return send(res, 500, { transcript: failure });
    } finally {
      running = false;
    }
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`GUARDIAN API listening on http://localhost:${PORT}`);
  console.log(`  POST /api/cycle          run a clean decision cycle`);
  console.log(`  POST /api/cycle?inject=1 run a cycle on poisoned market data`);
  console.log(`  GET  /api/transcript     last recorded transcript`);
});
