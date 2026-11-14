const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Short display/grouping name for a CUCM server.
 * FQDNs are trimmed to their host label ("cucm01.example.com" -> "cucm01");
 * IP addresses are returned whole, since their first octet is not unique.
 */
export function shortName(name: string): string {
  if (!name) return name;
  return IPV4.test(name) ? name : name.split(".")[0];
}
