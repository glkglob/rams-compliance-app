import { describe, expect, it } from "vitest";

import { chunkText, estimateTokens } from "../chunk-text";

describe("estimateTokens", () => {
  it("approximates ~4 characters per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(4000))).toBe(1000);
  });
});

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("One sentence. Two sentences.", 1000, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].metadata?.estimatedTokens).toBeGreaterThan(0);
  });

  it("splits long text into multiple, sequentially-indexed chunks", () => {
    const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} here.`).join(" ");
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
      expect(chunk.text.length).toBeLessThanOrEqual(100 + 40); // size + small overlap slack
    });
  });

  it("hard-splits a single oversized segment with no sentence breaks", () => {
    const text = "x".repeat(5000); // no punctuation -> one giant 'sentence'
    const chunks = chunkText(text, 1000, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // No chunk should massively exceed the limit (allow overlap slack).
      expect(chunk.text.length).toBeLessThanOrEqual(1000 + 200);
    }
  });

  it("never emits empty chunks", () => {
    const chunks = chunkText("   \n  ", 100, 10);
    expect(chunks.every((c) => c.text.length > 0)).toBe(true);
  });
});
