/** Accept conventional AI LaTeX delimiters while leaving photographed/code literals untouched. */
export function normalizeMathDelimiters(markdown: string): string {
  return markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    return part
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression: string) => `\n\n$$\n${expression.trim()}\n$$\n\n`)
      .replace(/\\\(([^]*?)\\\)/g, (_, expression: string) => `$${expression.trim()}$`);
  }).join("");
}
