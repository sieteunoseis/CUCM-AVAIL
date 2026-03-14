import { getDb, closeDb } from "../db/database.js";
import { syncAll } from "../services/sync.service.js";

// Standalone script to sync AXL data into the database
async function main() {
  console.log("Initializing database...");
  getDb();

  try {
    const result = await syncAll();
    console.log("\nSync complete:", result);
  } catch (err) {
    console.error("Sync failed:", err);
    process.exit(1);
  } finally {
    closeDb();
  }
}

main();
