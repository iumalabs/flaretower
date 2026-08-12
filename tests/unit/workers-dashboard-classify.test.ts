import { assertEquals } from "@std/assert";
import {
  classifyEnvironment,
  rollUpExposureStatus,
} from "../../worker/modules/workers-dashboard/classify.ts";

Deno.test("classifyEnvironment - custom domain present -> production", () => {
  assertEquals(classifyEnvironment(["custom_domain"]), "production");
});

Deno.test("classifyEnvironment - enabled workers.dev present -> production", () => {
  assertEquals(classifyEnvironment(["workers_dev"]), "production");
});

Deno.test("classifyEnvironment - only preview URL -> preview", () => {
  assertEquals(classifyEnvironment(["preview_url"]), "preview");
});

Deno.test("classifyEnvironment - mix of preview and production hostnames -> production", () => {
  assertEquals(classifyEnvironment(["preview_url", "custom_domain"]), "production");
});

Deno.test("classifyEnvironment - zero hostnames -> production (no undefined third state)", () => {
  assertEquals(classifyEnvironment([]), "production");
});

Deno.test("rollUpExposureStatus - zero hostnames (no-public-hostnames marker) -> safe", () => {
  assertEquals(rollUpExposureStatus([]), "safe");
});

Deno.test("rollUpExposureStatus - critical outranks everything", () => {
  assertEquals(rollUpExposureStatus(["safe", "warning", "critical", "not_evaluated"]), "critical");
});

Deno.test("rollUpExposureStatus - warning outranks safe and not_evaluated", () => {
  assertEquals(rollUpExposureStatus(["safe", "not_evaluated", "warning"]), "warning");
});

Deno.test("rollUpExposureStatus - not_evaluated outranks safe (never silently present as safe)", () => {
  assertEquals(rollUpExposureStatus(["safe", "not_evaluated"]), "not_evaluated");
});

Deno.test("rollUpExposureStatus - all safe -> safe", () => {
  assertEquals(rollUpExposureStatus(["safe", "safe"]), "safe");
});
