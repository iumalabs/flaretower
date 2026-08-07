import { assertEquals } from "@std/assert";
import { diffForDnsAlerts, dnsRecordKey } from "../../worker/modules/dns/alerts.ts";
import type { ZoneEvaluation } from "../../worker/modules/dns/types.ts";

function results(
  overrides: {
    recordName?: string;
    content?: string;
    status?: ZoneEvaluation["records"][number]["status"];
  },
): ZoneEvaluation[] {
  return [
    {
      zoneName: "example.com",
      records: [{
        zoneName: "example.com",
        recordName: overrides.recordName ?? "old-blog.example.com",
        recordType: "CNAME",
        content: overrides.content ?? "old.herokuapp.com",
        proxyCapable: true,
        proxied: false,
        status: overrides.status ?? "critical",
        reason: "test",
      }],
    },
  ];
}

Deno.test("diffForDnsAlerts - a record's first-ever evaluation alerts if critical (no grace period)", () => {
  const alerts = diffForDnsAlerts(results({ status: "critical" }), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForDnsAlerts - a record's first-ever evaluation does NOT alert if safe", () => {
  const alerts = diffForDnsAlerts(results({ status: "safe" }), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForDnsAlerts - unchanged critical across two runs does not repeat-alert", () => {
  const key = dnsRecordKey("example.com", "old-blog.example.com", "CNAME", "old.herokuapp.com");
  const previous = new Map([[key, "critical" as const]]);
  const alerts = diffForDnsAlerts(results({ status: "critical" }), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForDnsAlerts - a transition from safe to critical alerts", () => {
  const key = dnsRecordKey("example.com", "old-blog.example.com", "CNAME", "old.herokuapp.com");
  const previous = new Map([[key, "safe" as const]]);
  const alerts = diffForDnsAlerts(results({ status: "critical" }), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "safe");
});

Deno.test("diffForDnsAlerts - two round-robin A records with the same name+type but different content are tracked independently", () => {
  const zones: ZoneEvaluation[] = [
    {
      zoneName: "example.com",
      records: [
        {
          zoneName: "example.com",
          recordName: "www.example.com",
          recordType: "A",
          content: "203.0.113.1",
          proxyCapable: true,
          proxied: false,
          status: "warning",
          reason: "test",
        },
        {
          zoneName: "example.com",
          recordName: "www.example.com",
          recordType: "A",
          content: "203.0.113.2",
          proxyCapable: true,
          proxied: false,
          status: "warning",
          reason: "test",
        },
      ],
    },
  ];

  // Only the first record (.1) has a previous "warning" status recorded.
  const previous = new Map([
    [dnsRecordKey("example.com", "www.example.com", "A", "203.0.113.1"), "warning" as const],
  ]);

  const alerts = diffForDnsAlerts(zones, previous);

  // The second record (.2) is new-to-warning and must alert; the first
  // must not repeat-alert. If content weren't part of the key, both would
  // incorrectly collapse into a single "unchanged" entry.
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].content, "203.0.113.2");
});

Deno.test("diffForDnsAlerts - not_evaluated is never alert-worthy", () => {
  const alerts = diffForDnsAlerts(results({ status: "not_evaluated" }), new Map());
  assertEquals(alerts.length, 0);
});
