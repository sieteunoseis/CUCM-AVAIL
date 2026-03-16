import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { getDb, closeDb } from "./db/database.js";
import { startPoller, setOnPollComplete, setOnPollerLog, getLastPollTime, isPollInProgress } from "./services/poller.service.js";
import { runPoll } from "./services/poller.service.js";
import { setOnRisLog } from "./services/risport.service.js";
import serversRouter from "./routes/servers.routes.js";
import cmgroupsRouter from "./routes/cmgroups.routes.js";
import phonesRouter from "./routes/phones.routes.js";
import registrationsRouter from "./routes/registrations.routes.js";
import simulationRouter from "./routes/simulation.routes.js";
import syncRouter from "./routes/sync.routes.js";
import subnetsRouter from "./routes/subnets.routes.js";
import upgradeRouter from "./routes/upgrade.routes.js";
import devicepoolsRouter from "./routes/devicepools.routes.js";
import plannerRouter from "./routes/planner.routes.js";
import trunksRouter from "./routes/trunks.routes.js";
import agRouter from "./routes/ag.routes.js";
import gatewaysRouter from "./routes/gateways.routes.js";
import { join, dirname } from "path";
import { fileURLToPath, URL } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/servers", serversRouter);
app.use("/api/cmgroups", cmgroupsRouter);
app.use("/api/phones", phonesRouter);
app.use("/api/registrations", registrationsRouter);
app.use("/api/simulate", simulationRouter);
app.use("/api/sync", syncRouter);
app.use("/api/subnets", subnetsRouter);
app.use("/api/upgrade", upgradeRouter);
app.use("/api/devicepools", devicepoolsRouter);
app.use("/api/planner", plannerRouter);
app.use("/api/trunks", trunksRouter);
app.use("/api/ag", agRouter);
if (config.features.enableGateways) {
  app.use("/api/gateways", gatewaysRouter);
}

// Expose feature flags to client
app.get("/api/features", (_req, res) => {
  res.json({ enableGateways: config.features.enableGateways });
});

app.get("/api/poll/status", (_req, res) => {
  res.json({
    lastPollTime: getLastPollTime(),
    pollInProgress: isPollInProgress(),
    intervalMinutes: config.polling.intervalMinutes,
  });
});

// Serve static frontend in production
const clientDistCandidates = [
  join(__dirname, "../client/dist"),   // Docker: /app/server/../client/dist
  join(__dirname, "../../client/dist"), // Local build: dist/server/../../client/dist
];
const clientDist = clientDistCandidates.find((p) => existsSync(p));
if (clientDist) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}

// Socket.IO - notify clients when poll completes
setOnPollComplete(() => {
  io.emit("registration:updated");
});

// Socket.IO - forward poller/risport logs to clients
setOnPollerLog((message) => {
  io.emit("poller:log", message);
});
setOnRisLog((message) => {
  io.emit("poller:log", message);
});

io.on("connection", (socket) => {
  console.log("[Socket.IO] Client connected");
  socket.on("disconnect", () => {
    console.log("[Socket.IO] Client disconnected");
  });
});

// Initialize database
getDb();
console.log("[DB] Database initialized");

// Start server
httpServer.listen(config.server.port, () => {
  console.log(`[Server] Running on http://localhost:${config.server.port}`);
  startPoller();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDb();
  process.exit(0);
});
