import { describe, expect, it } from "vitest";
import { providerFor } from "./oembed";

describe("embed provider detection", () => {
  it("recognizes YouTube watch and short URLs", () => {
    expect(providerFor("https://www.youtube.com/watch?v=abc123")).toBe("youtube");
    expect(providerFor("https://youtu.be/abc123")).toBe("youtube");
  });
  it("recognizes Vimeo", () => {
    expect(providerFor("https://vimeo.com/12345")).toBe("vimeo");
  });
  it("rejects everything else", () => {
    expect(providerFor("https://example.com/video")).toBeNull();
    expect(providerFor("https://youtube.com.evil.com/watch")).toBeNull();
  });
});
