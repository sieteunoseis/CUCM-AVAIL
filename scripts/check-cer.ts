// Run: npx tsx scripts/check-cer.ts
import assert from "node:assert/strict";
import { maskToBits, normalizeCerPage, buildOverview, type CerSubnet } from "../server/utils/cer.ts";

// maskToBits
assert.equal(maskToBits("255.255.255.240"), 28);
assert.equal(maskToBits("255.255.255.0"), 24);
assert.equal(maskToBits("255.255.0.0"), 16);
assert.equal(maskToBits("255.0.255.0"), null);
assert.equal(maskToBits("garbage"), null);

// normalizeCerPage: single-object subnet, trimming
const single = normalizeCerPage({
  subnetDetails: {
    ipv4Subnets: {
      subnet: { subnetID: "10.77.131.32 ", subnetMask: "255.255.255.240", erlName: " ADMN 0-2 ", location: "QIP:CMKs1c1 ", isnontrackable: "false" },
    },
    ipv6Subnets: null,
  },
  paging: { count: "1", offset: "0", limit: "500" },
});
assert.deepEqual(single.subnets, [
  { cidr: "10.77.131.32/28", subnetId: "10.77.131.32", mask: "255.255.255.240", erlName: "ADMN 0-2", location: "QIP:CMKs1c1" },
]);
assert.equal(single.count, 1);
assert.equal(single.returned, 1);
assert.equal(single.skippedNontrackable, 0);

// normalizeCerPage: array with a nontrackable one and an invalid mask
const multi = normalizeCerPage({
  subnetDetails: {
    ipv4Subnets: {
      subnet: [
        { subnetID: "10.1.1.0", subnetMask: "255.255.255.0", erlName: "A", location: "L", isnontrackable: "false" },
        { subnetID: "10.1.2.0", subnetMask: "255.255.255.0", erlName: "B", location: "L", isnontrackable: "true" },
        { subnetID: "10.1.3.0", subnetMask: "255.0.255.0", erlName: "C", location: "L", isnontrackable: "false" },
      ],
    },
  },
  paging: { count: "3417" },
});
assert.deepEqual(multi.subnets.map((s) => s.cidr), ["10.1.1.0/24"]);
assert.equal(multi.skippedNontrackable, 1);
assert.equal(multi.returned, 3);
assert.equal(multi.count, 3417);

// empty page
const empty = normalizeCerPage({ subnetDetails: { ipv4Subnets: null }, paging: { count: "0" } });
assert.equal(empty.returned, 0);
assert.deepEqual(empty.subnets, []);

// buildOverview
const cer = (cidr: string, erlName = "ERL " + cidr): CerSubnet => ({
  cidr,
  subnetId: cidr.split("/")[0],
  mask: "",
  erlName,
  location: "LOC " + cidr,
});
const app = [
  { id: 1, cidr: "10.1.1.0/24", name: "a", description: "" },
  { id: 2, cidr: "10.2.0.0/24", name: "b", description: "" },
  { id: 3, cidr: "10.3.0.0/24", name: "c", description: "" },
];
const cerSubnets = [
  cer("10.1.1.0/24"),
  cer("10.2.0.0/25"),
  cer("10.2.0.128/25"),
  cer("10.9.0.0/16"),
  cer("10.9.1.0/24"),
  cer("10.8.0.0/16"),
  cer("10.7.0.0/24"), // no phones -> never shown
];
const phones = [
  { ip: "10.1.1.5", cmGroup: "G1" },
  { ip: "10.1.1.6", cmGroup: "G2" },
  { ip: "10.2.0.10", cmGroup: "G1" },
  { ip: "10.3.0.4", cmGroup: "G1" },
  { ip: "10.9.1.5", cmGroup: "G1" },
  { ip: "10.8.3.3", cmGroup: "G1" },
  { ip: "172.16.5.9", cmGroup: "G1" },
  { ip: "10.50.0.1", cmGroup: "G1" },
  { ip: "10.50.0.1", cmGroup: "G2" },
  { ip: null, cmGroup: "G1" },
  { ip: "", cmGroup: "G1" },
];
const o = buildOverview({ appSubnets: app, cerSubnets, phones });

assert.deepEqual(o.totals, { phones: 11, mapped: 4, noIp: 2, sharedIp: 2, unmappedWithIp: 3 });

const byId = (id: number) => o.subnets.find((s) => s.id === id)!;
assert.equal(byId(1).cerStatus, "match");
assert.equal(byId(1).phones, 2);
assert.deepEqual(byId(1).cmGroups, { G1: 1, G2: 1 });
assert.equal(byId(1).replaceWith, undefined);
assert.equal(byId(2).cerStatus, "mismatch");
assert.deepEqual(byId(2).cer!.map((c) => c.cidr), ["10.2.0.0/25", "10.2.0.128/25"]);
assert.deepEqual(byId(2).replaceWith, ["10.2.0.0/25"]);
assert.equal(byId(3).cerStatus, "missing");
assert.deepEqual(byId(3).cer, []);

assert.deepEqual(
  o.unmapped.inCer.map((u) => [u.cidr, u.phones, u.broad]),
  [
    ["10.8.0.0/16", 1, true],
    ["10.9.1.0/24", 1, false],
  ],
);
assert.deepEqual(o.unmapped.notInCer, [{ cidr: "172.16.5.0/24", phones: 1 }]);
assert.ok(!o.unmapped.inCer.some((u) => u.cidr === "10.7.0.0/24"));

// sorted by phones desc (tie keeps cidr order)
const o2 = buildOverview({
  appSubnets: [],
  cerSubnets: [cer("10.9.1.0/24"), cer("10.8.0.0/24")],
  phones: [{ ip: "10.9.1.1", cmGroup: "G" }, { ip: "10.8.0.1", cmGroup: "G" }, { ip: "10.8.0.2", cmGroup: "G" }],
});
assert.deepEqual(o2.unmapped.inCer.map((u) => u.cidr), ["10.8.0.0/24", "10.9.1.0/24"]);

// no CER synced
const n = buildOverview({ appSubnets: app, cerSubnets: null, phones });
assert.equal(n.subnets[0].cerStatus, undefined);
assert.equal(n.subnets[0].cer, undefined);
assert.deepEqual(n.unmapped.inCer, []);
assert.deepEqual(
  n.unmapped.notInCer.map((u) => u.cidr).sort(),
  ["10.8.3.0/24", "10.9.1.0/24", "172.16.5.0/24"],
);

console.log("cer checks passed");
