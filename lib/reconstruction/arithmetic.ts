export interface ArithmeticVerification {
  status: "VERIFIED" | "SUSPICIOUS" | "NOT_VERIFIED";
  message: string;
}

/** A deliberately small numeric expression parser. It never evaluates JavaScript. */
function numericExpression(source: string): number {
  if (source.length > 512)
    throw new Error("Expression exceeds verifier limits.");
  let expression = source
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\div/g, "/")
    .replace(/−/g, "-");
  for (let i = 0; i < 12 && /\\frac/.test(expression); i++) {
    const replaced = expression.replace(
      /\\frac\{([^{}]+)\}\{([^{}]+)\}/g,
      "(($1)/($2))",
    );
    if (replaced === expression) break;
    expression = replaced;
  }
  expression = expression
    .replace(/[{}]/g, (character) => (character === "{" ? "(" : ")"))
    .replace(/\s+/g, "");
  if (!expression || !/^[\d.+\-*/^()]+$/.test(expression))
    throw new Error("Symbolic or unsupported expression.");
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+\-*/^()]/g) ?? [];
  if (tokens.length > 256)
    throw new Error("Expression exceeds verifier limits.");
  let position = 0;
  let depth = 0;
  function primary(): number {
    if (++depth > 32)
      throw new Error("Expression nesting exceeds verifier limits.");
    let value: number;
    const token = tokens[position++];
    if (token === "(") {
      value = sum();
      if (tokens[position++] !== ")") throw new Error("Unbalanced expression.");
    } else if (token && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      value = Number(token);
    } else {
      throw new Error("Unsupported expression.");
    }
    depth--;
    return value;
  }
  function power(): number {
    const base = primary();
    if (tokens[position] !== "^") return base;
    position++;
    const exponent = unary();
    if (Math.abs(exponent) > 100)
      throw new Error("Exponent exceeds verifier limits.");
    return Math.pow(base, exponent);
  }
  function unary(): number {
    if (tokens[position] === "+") {
      position++;
      return unary();
    }
    if (tokens[position] === "-") {
      position++;
      return -unary();
    }
    return power();
  }
  function product(): number {
    let value = unary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const next = unary();
      if (operator === "/" && next === 0) throw new Error("Division by zero.");
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const next = product();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  }
  const value = sum();
  if (position !== tokens.length || !Number.isFinite(value))
    throw new Error("Unsupported or non-finite expression.");
  return value;
}

/** Verifies only complete numeric equalities, never symbolic derivations or proofs. */
export function verifyArithmetic(latex: string): ArithmeticVerification {
  const unverified: ArithmeticVerification = {
    status: "NOT_VERIFIED",
    message:
      "Not independently verified. Only simple numeric equalities are supported.",
  };
  const expression = latex.trim().replace(/^\$+|\$+$/g, "");
  if (
    expression.length > 512 ||
    /\\\\|\\begin|\\end|\n|<=|>=|!=/.test(expression)
  )
    return unverified;
  const sides = expression.split("=");
  if (
    sides.length < 2 ||
    sides.length > 8 ||
    sides.some((side) => !side.trim())
  )
    return unverified;
  try {
    const values = sides.map(numericExpression);
    const matches = values.every(
      (value) =>
        Math.abs(value - values[0]) <=
        1e-9 * Math.max(1, Math.abs(value), Math.abs(values[0])),
    );
    return matches
      ? {
          status: "VERIFIED",
          message:
            "Numeric equality checked by the deterministic arithmetic verifier. This does not verify a symbolic derivation.",
        }
      : {
          status: "SUSPICIOUS",
          message:
            "The numeric sides of this equality do not match. Review the source photograph.",
        };
  } catch {
    return unverified;
  }
}
