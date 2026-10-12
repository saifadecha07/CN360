import { describe, it, expect } from "vitest";
import { parseHash } from "../src/app/router";

describe("parseHash", () => {
  it("parses paths and params", () => {
    expect(parseHash("").path).toBe("/");
    expect(parseHash("#/lobby").path).toBe("/lobby");
    const r = parseHash("#/immersive?mode=live");
    expect(r.path).toBe("/immersive");
    expect(r.params.get("mode")).toBe("live");
  });
});
