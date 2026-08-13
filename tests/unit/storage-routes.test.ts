import { assertEquals } from "@std/assert";
import { boundToLabel } from "../../worker/modules/storage/routes.ts";

Deno.test("boundToLabel - none when referenced by zero Workers", () => {
  assertEquals(boundToLabel([]), "none");
});

Deno.test("boundToLabel - the single Worker's name when referenced by exactly one", () => {
  assertEquals(boundToLabel(["auth-broker"]), "auth-broker");
});

Deno.test("boundToLabel - a count, not a name list, when referenced by more than one", () => {
  assertEquals(boundToLabel(["worker-a", "worker-b", "worker-c"]), "3 workers");
});
