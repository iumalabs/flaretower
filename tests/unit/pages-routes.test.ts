import { assertEquals } from "@std/assert";
import { deriveProductionDomain } from "../../worker/modules/pages/routes.ts";

function domainRow(
  status: string,
  domainName: string,
): { project_name: string; domain_name: string; status: string; reason: string } {
  return { project_name: "marketing-site", domain_name: domainName, status, reason: "test" };
}

Deno.test("deriveProductionDomain - returns the first safe-status domain", () => {
  const domains = [
    domainRow("warning", "staging.example.com"),
    domainRow("safe", "example.com"),
    domainRow("safe", "www.example.com"),
  ];
  assertEquals(deriveProductionDomain(domains), "example.com");
});

Deno.test("deriveProductionDomain - null when the project has zero active domains", () => {
  const domains = [
    domainRow("warning", "staging.example.com"),
    domainRow("not_evaluated", "broken.example.com"),
  ];
  assertEquals(deriveProductionDomain(domains), null);
});

Deno.test("deriveProductionDomain - null when the project has zero custom domains at all", () => {
  assertEquals(deriveProductionDomain([]), null);
});
