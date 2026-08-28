import http from "node:http";

/**
 * Railway 等が PORT でヘルスチェックする場合に備えた最小 HTTP サーバー
 */
export function startHealthServer() {
  const port = Number(process.env.PORT) || 8080;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[health] http://0.0.0.0:${port}`);
  });
  server.on("error", (err) => {
    console.warn("[health] server error:", err.message);
  });
  return server;
}
