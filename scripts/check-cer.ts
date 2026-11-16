// Run: npx tsx scripts/check-cer.ts
import assert from "node:assert/strict";
import { maskToBits, normalizeCerPage, buildOverview, pageThrough, type CerSubnet } from "../server/utils/cer.ts";

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

// --- v1.8.2: shared-IP phones (Expressway/MRA) count under a defined subnet that covers them ---
{
  const r = buildOverview({
    appSubnets: [{ id: 9, cidr: "10.156.20.48/32", name: "psxMRACore01", description: "" }],
    cerSubnets: [cer("10.156.20.0/24")],
    phones: [
      { ip: "10.156.20.48", cmGroup: "G1" },
      { ip: "10.156.20.48", cmGroup: "G2" },
      { ip: "10.156.20.48", cmGroup: "G1" },
      { ip: "10.70.0.9", cmGroup: "G1" },
      { ip: "10.70.0.9", cmGroup: "G1" },
    ],
  });
  assert.equal(r.subnets[0].phones, 3);
  assert.deepEqual(r.subnets[0].cmGroups, { G1: 2, G2: 1 });
  assert.deepEqual(r.totals, { phones: 5, mapped: 3, noIp: 0, sharedIp: 2, unmappedWithIp: 0 });
  // shared-IP phones never feed CER replace/import suggestions
  assert.deepEqual(r.subnets[0].replaceWith, []);
  assert.deepEqual(r.unmapped.inCer, []);
  assert.deepEqual(r.unmapped.notInCer, []);
}

// --- v1.8.3: "inside" status + Use CER when the wider CER subnet is already defined ---
{
  const r = buildOverview({
    appSubnets: [
      { id: 1, cidr: "10.156.20.0/24", name: "server vlan", description: "" },
      { id: 2, cidr: "10.156.20.48/32", name: "psxMRACore01", description: "" },
      { id: 3, cidr: "10.40.0.0/24", name: "narrow, CER wider, not defined", description: "" },
      { id: 4, cidr: "10.41.0.0/23", name: "mixed", description: "" },
    ],
    cerSubnets: [cer("10.156.20.0/24"), cer("10.40.0.0/16"), cer("10.41.0.0/22"), cer("10.41.0.0/24")],
    phones: [
      { ip: "10.156.20.48", cmGroup: "G" },
      { ip: "10.156.20.48", cmGroup: "G" },
    ],
  });
  const by = (id: number) => r.subnets.find((s) => s.id === id)!;
  assert.equal(by(1).cerStatus, "match");
  assert.equal(by(2).cerStatus, "inside");
  assert.deepEqual(by(2).replaceWith, ["10.156.20.0/24"]); // already defined -> Use CER just removes the /32
  assert.equal(by(3).cerStatus, "inside");
  assert.deepEqual(by(3).replaceWith, []); // CER /16 has no phones and isn't defined
  assert.equal(by(4).cerStatus, "mismatch"); // CER both wider (/22) and narrower (/24)
}
{
  // inside + wider CER subnet has phones but is NOT defined here -> no Use CER (don't swap a /24 for a /16)
  const r = buildOverview({
    appSubnets: [{ id: 1, cidr: "10.30.1.0/24", name: "br", description: "" }],
    cerSubnets: [cer("10.30.0.0/16")],
    phones: [{ ip: "10.30.1.7", cmGroup: "G" }],
  });
  assert.equal(r.subnets[0].cerStatus, "inside");
  assert.deepEqual(r.subnets[0].replaceWith, []);
}

// --- Fix pass: unexpected bodies and truncated paging must not "succeed" ---
assert.equal(normalizeCerPage({ status: "Access Denied" }).valid, false);
assert.equal(normalizeCerPage({ subnetDetails: null, paging: { count: "0" } }).valid, false);
assert.equal(multi.valid, true);

const page = (ids: string[], count: number) => ({
  subnetDetails: { ipv4Subnets: { subnet: ids.map((id) => ({ subnetID: id, subnetMask: "255.255.255.0", erlName: "E", location: "L", isnontrackable: "false" })) } },
  paging: { count: String(count) },
});
const pagesOk = [page(["10.0.1.0", "10.0.2.0"], 3), page(["10.0.3.0"], 3)];
const okRun = await pageThrough(async (offset) => (offset === 0 ? pagesOk[0] : pagesOk[1]), 2);
assert.equal(okRun.subnets.length, 3);
await assert.rejects(pageThrough(async () => ({ status: "Access Denied" }), 2), /unexpected/i);
await assert.rejects(
  pageThrough(async (offset) => (offset === 0 ? page(["10.0.1.0", "10.0.2.0"], 5) : page([], 5)), 2),
  /incomplete/i,
);
await assert.rejects(pageThrough(async () => page([], 0), 2, 3417), /0 subnets/i);

// --- Fix pass: prod-scale overview must not block for seconds ---
{
  const cerBig: CerSubnet[] = [];
  for (let i = 0; i < 3417; i++) cerBig.push(cer(`10.${(i >> 8) & 255}.${i & 255}.0/24`));
  const appBig = [] as { id: number; cidr: string; name: string; description: string }[];
  for (let i = 0; i < 1170; i++) appBig.push({ id: i + 1, cidr: `10.${(i >> 8) & 255}.${i & 255}.0/24`, name: "n", description: "" });
  const phonesBig = [] as { ip: string | null; cmGroup: string }[];
  for (let i = 0; i < 37700; i++) phonesBig.push({ ip: i % 2 ? null : `10.${(i >> 16) & 15}.${(i >> 8) & 255}.${(i & 255) | 1}`, cmGroup: "G" });
  const t0 = performance.now();
  buildOverview({ appSubnets: appBig, cerSubnets: cerBig, phones: phonesBig });
  const ms = performance.now() - t0;
  console.log(`prod-scale overview: ${Math.round(ms)}ms`);
  assert.ok(ms < 500, `buildOverview took ${Math.round(ms)}ms at prod scale (limit 500ms)`);
}

console.log("cer checks passed");
