import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "../lib/markdown";

describe("lecture mathematics in natural document flow", () => {
  it("renders conventional inline and display LaTeX without changing its notation", () => {
    expect(normalizeMathDelimiters(String.raw`Türkçe: \(P_y=Q_x\).\[A=Q\Lambda Q^T\]`)).toBe("Türkçe: $P_y=Q_x$.\n\n$$\nA=Q\\Lambda Q^T\n$$\n\n");
  });
  it("preserves photographed programming literals in fenced and inline code", () => {
    const source = "```cpp\nstd::string pattern = R\"(\\(x\\))\";\n```\n`\\(literal\\)` and \\(x^2\\).";
    expect(normalizeMathDelimiters(source)).toBe(source.replace("and \\(x^2\\).", "and $x^2$."));
  });
  it("keeps existing dollar math stable across repeated rendering", () => {
    const source = "Equation $x^2$ and $$\\frac{a}{b}$$ remain as supplied.";
    expect(normalizeMathDelimiters(normalizeMathDelimiters(source))).toBe(source);
  });
});
