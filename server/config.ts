import dotenv from "dotenv";
dotenv.config();

export const config = {
  cucm: {
    host: process.env.CUCM_PUB || "",
    username: process.env.CUCM_USERNAME || process.env.CUCM_USER || "",
    password: process.env.CUCM_PASSWORD || process.env.CUCM_PASS || "",
    version: process.env.CUCM_VERSION || "15.0",
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
};
