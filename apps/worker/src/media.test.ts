import { describe, expect, it } from "vitest";
import { sniffKind } from "./media.js";

/** Magic-byte sniffing is the hard gate of the trust pipeline — test every signature. */
describe("content-type sniffing", () => {
  it("recognizes JPEG", () => {
    expect(sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image");
  });
  it("recognizes PNG", () => {
    expect(sniffKind(Buffer.from("\x89PNG\r\n\x1a\n0000", "binary"))).toBe("image");
  });
  it("recognizes WebP (RIFF container)", () => {
    expect(sniffKind(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "binary"))).toBe("image");
  });
  it("recognizes MP3 with ID3 tag", () => {
    expect(sniffKind(Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "binary"))).toBe("audio");
  });
  it("recognizes raw MPEG audio frame sync", () => {
    expect(sniffKind(Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0]))).toBe("audio");
  });
  it("recognizes M4A (ftyp container)", () => {
    expect(sniffKind(Buffer.from("\x00\x00\x00\x20ftypM4A ", "binary"))).toBe("audio");
  });
  it("rejects text claiming to be media", () => {
    expect(sniffKind(Buffer.from("this is not an image at all"))).toBe("unknown");
  });
  it("rejects HTML (a classic smuggling vector)", () => {
    expect(sniffKind(Buffer.from("<!DOCTYPE html><script>alert(1)</script>"))).toBe("unknown");
  });
  it("rejects empty files", () => {
    expect(sniffKind(Buffer.alloc(0))).toBe("unknown");
  });
});
