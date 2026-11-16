import dotenv from "dotenv";
dotenv.config();

export const config = {
  cucm: {
    host: process.env.CUCM_PUB || "",
    username: process.env.CUCM_USERNAME || process.env.CUCM_USER || "",
    password: process.env.CUCM_PASSWORD || process.env.CUCM_PASS || "",
    version: process.env.CUCM_VERSION || "15.0",
  },
  cer: {
    host: process.env.CER_PUB || "",
    username: process.env.CER_USERNAME || "",
    password: process.env.CER_PASSWORD || "",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
  },
  db: {
    path: process.env.DB_PATH || "./data/cucm.db",
  },
  polling: {
    intervalMinutes: parseInt(process.env.POLL_INTERVAL || "15", 10),
  },
  features: {
    enableGateways: (process.env.ENABLE_GATEWAYS || "false").toLowerCase() === "true",
    demoMode: (process.env.DEMO_MODE || "false").toLowerCase() === "true",
    enableCer: false,
  },
};

// CER add-on: on only when fully configured, never in demo mode.
config.features.enableCer =
  !!(config.cer.host && config.cer.username && config.cer.password) && !config.features.demoMode;
