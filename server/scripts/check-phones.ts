import axlService from "cisco-axl";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const svc = new axlService(
    process.env.CUCM_PUB!,
    process.env.CUCM_USERNAME!,
    process.env.CUCM_PASSWORD!,
    process.env.CUCM_VERSION!
  );

  // Check phone data
  const sample = await svc.executeOperation("executeSQLQuery", {
    sql: `SELECT FIRST 5 d.name, dp.name as dpname
          FROM device d
          JOIN devicepool dp ON d.fkdevicepool = dp.pkid
          WHERE d.tkclass = 1`,
  });
  console.log("Sample phones:", JSON.stringify(sample, null, 2));

  // Check device pool -> CMG mapping from AXL
  const dpCheck = await svc.executeOperation("executeSQLQuery", {
    sql: `SELECT FIRST 10 dp.name as dpname, cmg.name as cmgname
          FROM devicepool dp
          JOIN callmanagergroup cmg ON dp.fkcallmanagergroup = cmg.pkid`,
  });
  console.log("DP -> CMG mapping:", JSON.stringify(dpCheck, null, 2));

  // Check what listDevicePool returns
  const dpList = await svc.executeOperation("listDevicePool", {
    searchCriteria: { name: "%" },
    returnedTags: { name: "", callManagerGroupName: "" },
  });
  console.log("listDevicePool result:", JSON.stringify(dpList, null, 2));
}

main().catch(console.error);
