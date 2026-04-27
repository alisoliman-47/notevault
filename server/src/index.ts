import http from "node:http";
import { VaultService } from "./vault/vault-service.js";
import { createHttpApp } from "./http-app.js";

const PORT = Number(process.env.PORT) || 8787;

const vault = new VaultService("");
const app = createHttpApp(vault);

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`NoteVault API http://127.0.0.1:${PORT}`);
  console.log("Open the client, then POST /api/vault with { path: '<vault folder>' }");
});
