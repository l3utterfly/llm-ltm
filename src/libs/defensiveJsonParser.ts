/**
 * defensiveJsonParser
 * -------------------
 * Best-effort extraction + parsing of JSON produced by small / unreliable LLMs.
 *
 * Defensive layers (in order):
 *  1. Candidate extraction  — pull JSON out of surrounding prose / code fences,
 *                             including truncated JSON at the end of the text.
 *  2. Syntax repair         — fix single quotes, smart quotes, unquoted keys,
 *                             bare-word values, trailing commas, comments,
 *                             Python literals (True/None), NaN/Infinity,
 *                             unbalanced/missing closing brackets, unterminated
 *                             strings (truncated output).
 *  3. Schema reconciliation — fuzzy field-name matching (normalised +
 *                             Levenshtein), recursive through nested objects
 *                             and arrays.
 *  4. Type coercion         — "42" -> 42, "true" -> true, scalar -> [scalar],
 *                             number -> "number", fuzzy enum matching, etc.
 *  5. Defaults / required   — fill `default`s, report missing `required`s.
 *  6. Candidate scoring     — if several JSON blobs appear in the text, pick
 *                             the one that best satisfies the schema.
 *
 * Never throws. Returns { ok, data, warnings, errors } so callers can decide
 * how strict to be.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type JsonType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

/** Minimal JSON-Schema subset. Extend as needed. */
export interface JsonSchema {
  type?: JsonType;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  /** Keep input keys that match no schema property? (default: false) */
  additionalProperties?: boolean;
  /** Per-field override of the fuzzy-match distance. */
  maxKeyDistance?: number;
}

export interface ParseOptions {
  /**
   * Max Levenshtein distance for key matching. Default is adaptive:
   * max(1, floor(keyLength / 3)), capped at 3.
   */
  maxKeyDistance?: number;
  /** Coerce primitive types to match the schema (default: true). */
  coerceTypes?: boolean;
  /** Fill `default` values for missing fields (default: true). */
  applyDefaults?: boolean;
}

export interface ParseResult<T = unknown> {
  /** True if we produced data and no hard errors occurred. */
  ok: boolean;
  data: T | null;
  /** Recoverable issues: repairs made, fuzzy matches, coercions, defaults. */
  warnings: string[];
  /** Fatal issues: no JSON found, required fields missing, etc. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Levenshtein + key normalisation
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Normalise a key so that camelCase / snake_case / kebab-case / SCREAMING
 * variants of the same name compare equal at distance 0.
 * e.g. "userName", "user_name", "User-Name" -> "username"
 */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

function defaultDistanceFor(key: string): number {
  return Math.min(3, Math.max(1, Math.floor(key.length / 3)));
}

// ---------------------------------------------------------------------------
// Stage 1: candidate extraction
// ---------------------------------------------------------------------------

interface Candidate {
  text: string;
  /** Lower = preferred source (fenced block beats loose scan). */
  sourceRank: number;
}

/** Scan from `start` (an opening { or [) to its balanced close. -1 if unterminated. */
function findBalancedEnd(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  let quote = "";
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
    } else if (c === "{" || c === "[") {
      stack.push(c);
    } else if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

function extractCandidates(raw: string): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const push = (text: string, sourceRank: number) => {
    const t = text.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      candidates.push({ text: t, sourceRank });
    }
  };

  // 1) Fenced code blocks: ```json ... ``` or plain ``` ... ```
  const fence = /```(?:json[5c]?|javascript|js)?\s*\n?([\s\S]*?)```/gi;
  for (let m = fence.exec(raw); m; m = fence.exec(raw)) push(m[1], 0);

  // 1b) Unterminated fence (model got cut off mid-block)
  const lastFence = raw.lastIndexOf("```");
  if (lastFence !== -1 && raw.indexOf("```", lastFence + 3) === -1) {
    const tail = raw.slice(lastFence + 3).replace(/^json[5c]?|^javascript|^js/i, "");
    if (/[{[]/.test(tail)) push(tail, 1);
  }

  // 2) Balanced top-level {...} / [...] blocks anywhere in the text
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "{" || c === "[") {
      const end = findBalancedEnd(raw, i);
      if (end !== -1) {
        push(raw.slice(i, end + 1), 2);
        i = end + 1;
        continue;
      } else {
        // Truncated JSON running to end-of-text: still a candidate;
        // the repair stage will close it.
        push(raw.slice(i), 3);
        break;
      }
    }
    i++;
  }

  // 3) Whole input as a last resort (only if it could plausibly be JSON)
  if (/[{[]/.test(raw)) push(raw, 4);

  return candidates;
}

// ---------------------------------------------------------------------------
// Stage 2: syntax repair (single character-scan rebuild)
// ---------------------------------------------------------------------------

const WORD_REPLACEMENTS: Record<string, string> = {
  true: "true",
  false: "false",
  null: "null",
  True: "true",
  False: "false",
  TRUE: "true",
  FALSE: "false",
  None: "null",
  NULL: "null",
  Null: "null",
  undefined: "null",
  NaN: "null",
  Infinity: "null",
};

/**
 * Rebuilds the candidate into strict JSON. Handles:
 *  - smart quotes -> straight quotes
 *  - 'single quoted' -> "double quoted" (escaping inner ")
 *  - // line and slash-star block comments
 *  - unquoted keys ({foo: 1} -> {"foo": 1})
 *  - bare-word values ({a: yes} -> {"a": "yes"})
 *  - Python/JS literals: True, None, undefined, NaN, Infinity
 *  - trailing commas
 *  - missing commas between } { or " " pairs on adjacent lines (best effort)
 *  - control characters / raw newlines inside strings
 *  - unterminated strings + unbalanced brackets (truncation)
 */
function repairJson(input: string, warnings: string[]): string {
  // Normalise smart quotes up front.
  const src = input
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A]/g, "'");
  if (src !== input) warnings.push("Normalised smart quotes.");

  let out = "";
  const stack: string[] = [];
  let i = 0;
  let repaired = false;

  const lastNonWs = (): string => {
    for (let k = out.length - 1; k >= 0; k--) {
      if (!/\s/.test(out[k])) return out[k];
    }
    return "";
  };
  const stripTrailingComma = () => {
    let k = out.length - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    if (out[k] === ",") {
      out = out.slice(0, k) + out.slice(k + 1);
      repaired = true;
    }
  };

  while (i < src.length) {
    const c = src[i];

    // --- strings ---------------------------------------------------------
    if (c === '"' || c === "'") {
      const quote = c;
      if (quote === "'") repaired = true;
      let str = "";
      i++;
      let closed = false;
      while (i < src.length) {
        const s = src[i];
        if (s === "\\") {
          const next = src[i + 1] ?? "";
          if ("\"\\/bfnrtu'".includes(next)) {
            str += next === "'" ? "'" : "\\" + next;
            i += 2;
          } else {
            str += "\\\\"; // lone backslash -> escape it
            i++;
            repaired = true;
          }
          continue;
        }
        if (s === quote) {
          closed = true;
          i++;
          break;
        }
        if (s === '"') {
          str += '\\"'; // unescaped double quote inside single-quoted string
          i++;
          continue;
        }
        if (s === "\n") str += "\\n";
        else if (s === "\r") str += "\\r";
        else if (s === "\t") str += "\\t";
        else if (s.charCodeAt(0) < 0x20) {
          str += "\\u" + s.charCodeAt(0).toString(16).padStart(4, "0");
          repaired = true;
        } else str += s;
        i++;
      }
      if (!closed) {
        warnings.push("Closed an unterminated string (output looked truncated).");
      }
      out += '"' + str + '"';
      continue;
    }

    // --- comments --------------------------------------------------------
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      repaired = true;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      repaired = true;
      continue;
    }

    // --- structure -------------------------------------------------------
    if (c === "{" || c === "[") {
      stack.push(c === "{" ? "}" : "]");
      out += c;
      i++;
      continue;
    }
    if (c === "}" || c === "]") {
      stripTrailingComma(); // trailing comma before close
      if (stack.length && stack[stack.length - 1] === c) stack.pop();
      out += c;
      i++;
      continue;
    }

    // --- bare words: keys, literals, or unquoted string values ------------
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$.-]/.test(src[j])) j++;
      const word = src.slice(i, j);
      // Lookahead for ':' -> it's a key
      let k = j;
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] === ":") {
        out += `"${word}"`;
        repaired = true;
      } else if (word in WORD_REPLACEMENTS) {
        if (WORD_REPLACEMENTS[word] !== word) repaired = true;
        out += WORD_REPLACEMENTS[word];
      } else if ([",", "}", "]", ""].includes(src[k] ?? "")) {
        out += `"${word}"`; // bare-word value -> string
        repaired = true;
      } else {
        out += word;
      }
      i = j;
      continue;
    }

    // --- numbers (handle +5, .5, 1., hex-ish leniently) -------------------
    if (/[\d+\-.]/.test(c) && /[\d.]/.test(src[i + 1] ?? c)) {
      let j = i;
      if (src[j] === "+") {
        j++;
        repaired = true;
      }
      let num = src[j] === "-" ? "-" : "";
      if (src[j] === "-") j++;
      while (j < src.length && /[\d.eE+-]/.test(src[j])) {
        num += src[j];
        j++;
      }
      if (num.startsWith(".")) num = "0" + num;
      if (num.endsWith(".")) num = num + "0";
      out += num;
      i = j;
      continue;
    }

    // --- missing comma between values (e.g. `"a": 1\n"b": 2`) -------------
    if (c === "\n") {
      const prev = lastNonWs();
      let k = i + 1;
      while (k < src.length && /\s/.test(src[k])) k++;
      const next = src[k] ?? "";
      if (
        /["}\]\dA-Za-z]/.test(prev) &&
        (next === '"' || next === "{" || next === "[") &&
        stack.length > 0
      ) {
        // Only insert if prev token plausibly ended a value and next starts one.
        const closer = stack[stack.length - 1];
        if (closer === "}" || closer === "]") {
          out += ",";
          repaired = true;
          warnings.push("Inserted a missing comma between values.");
        }
      }
      out += c;
      i++;
      continue;
    }

    out += c;
    i++;
  }

  // Close anything left open (truncated output).
  if (stack.length) {
    stripTrailingComma();
    while (stack.length) out += stack.pop();
    warnings.push("Appended missing closing brackets (output looked truncated).");
  }

  if (repaired) warnings.push("Repaired malformed JSON syntax.");
  return out;
}

// ---------------------------------------------------------------------------
// Stages 3–5: schema reconciliation, coercion, defaults
// ---------------------------------------------------------------------------

interface CoerceCtx {
  options: Required<ParseOptions>;
  warnings: string[];
  errors: string[];
  /** Higher = better fit; used to choose between candidates. */
  score: number;
}

function coerceToSchema(value: unknown, schema: JsonSchema | undefined, path: string, ctx: CoerceCtx): unknown {
  if (!schema) return value;

  // enum first — it constrains regardless of type
  if (schema.enum && schema.enum.length) {
    if (schema.enum.some((e) => e === value)) {
      ctx.score += 1;
      return value;
    }
    // case-insensitive / fuzzy string match against enum
    if (typeof value === "string") {
      const norm = normaliseKey(value);
      let best: unknown;
      let bestDist = Infinity;
      for (const e of schema.enum) {
        if (typeof e !== "string") continue;
        const d = levenshtein(norm, normaliseKey(e));
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      const limit = schema.maxKeyDistance ?? defaultDistanceFor(String(best ?? ""));
      if (best !== undefined && bestDist <= limit) {
        if (bestDist > 0 || best !== value)
          ctx.warnings.push(`${path}: matched enum value "${value}" -> "${best}".`);
        ctx.score += 0.5;
        return best;
      }
    }
    ctx.warnings.push(`${path}: value ${JSON.stringify(value)} is not in enum [${schema.enum.map((e) => JSON.stringify(e)).join(", ")}].`);
    ctx.score -= 1;
    return value;
  }

  switch (schema.type) {
    case "object":
      return coerceObject(value, schema, path, ctx);
    case "array":
      return coerceArray(value, schema, path, ctx);
    case "string":
      if (typeof value === "string") {
        ctx.score += 1;
        return value;
      }
      if (ctx.options.coerceTypes && (typeof value === "number" || typeof value === "boolean")) {
        ctx.warnings.push(`${path}: coerced ${typeof value} ${JSON.stringify(value)} to string.`);
        return String(value);
      }
      if (value === null || value === undefined) return missing(schema, path, ctx);
      ctx.errors.push(`${path}: expected string, got ${typeOf(value)}.`);
      ctx.score -= 1;
      return value;
    case "number":
    case "integer": {
      if (typeof value === "number" && Number.isFinite(value)) {
        ctx.score += 1;
        return schema.type === "integer" && !Number.isInteger(value)
          ? (ctx.warnings.push(`${path}: rounded ${value} to integer.`), Math.round(value))
          : value;
      }
      if (ctx.options.coerceTypes && typeof value === "string") {
        const n = Number(value.replace(/[, ]+/g, ""));
        if (Number.isFinite(n)) {
          ctx.warnings.push(`${path}: coerced string "${value}" to number.`);
          return schema.type === "integer" ? Math.round(n) : n;
        }
      }
      if (ctx.options.coerceTypes && typeof value === "boolean") {
        ctx.warnings.push(`${path}: coerced boolean to number.`);
        return value ? 1 : 0;
      }
      if (value === null || value === undefined) return missing(schema, path, ctx);
      ctx.errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}.`);
      ctx.score -= 1;
      return value;
    }
    case "boolean": {
      if (typeof value === "boolean") {
        ctx.score += 1;
        return value;
      }
      if (ctx.options.coerceTypes) {
        if (typeof value === "string") {
          const v = value.trim().toLowerCase();
          if (["true", "yes", "y", "1", "on"].includes(v)) return warnCoerce(path, value, true, ctx);
          if (["false", "no", "n", "0", "off"].includes(v)) return warnCoerce(path, value, false, ctx);
        }
        if (typeof value === "number") return warnCoerce(path, value, value !== 0, ctx);
      }
      if (value === null || value === undefined) return missing(schema, path, ctx);
      ctx.errors.push(`${path}: expected boolean, got ${typeOf(value)}.`);
      ctx.score -= 1;
      return value;
    }
    case "null":
      if (value !== null) ctx.warnings.push(`${path}: expected null, got ${typeOf(value)}.`);
      return null;
    default:
      // No type specified: recurse if structural hints exist.
      if (schema.properties) return coerceObject(value, { ...schema, type: "object" }, path, ctx);
      if (schema.items) return coerceArray(value, { ...schema, type: "array" }, path, ctx);
      return value;
  }
}

function warnCoerce(path: string, from: unknown, to: unknown, ctx: CoerceCtx): unknown {
  ctx.warnings.push(`${path}: coerced ${JSON.stringify(from)} to ${JSON.stringify(to)}.`);
  return to;
}

function missing(schema: JsonSchema, path: string, ctx: CoerceCtx): unknown {
  if (ctx.options.applyDefaults && "default" in schema) {
    ctx.warnings.push(`${path}: missing/null — applied default ${JSON.stringify(schema.default)}.`);
    return schema.default;
  }
  return null;
}

function typeOf(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

function coerceArray(value: unknown, schema: JsonSchema, path: string, ctx: CoerceCtx): unknown {
  let arr: unknown[];
  if (Array.isArray(value)) {
    arr = value;
    ctx.score += 1;
  } else if (value === null || value === undefined) {
    return "default" in schema ? missing(schema, path, ctx) : [];
  } else {
    ctx.warnings.push(`${path}: expected array, got ${typeOf(value)} — wrapped it in an array.`);
    arr = [value];
  }
  return arr.map((item, idx) => coerceToSchema(item, schema.items, `${path}[${idx}]`, ctx));
}

function coerceObject(value: unknown, schema: JsonSchema, path: string, ctx: CoerceCtx): unknown {
  if (value === null || value === undefined) {
    if ("default" in schema) return missing(schema, path, ctx);
  }
  if (typeOf(value) !== "object") {
    ctx.errors.push(`${path}: expected object, got ${typeOf(value)}.`);
    ctx.score -= 2;
    return value;
  }
  const input = value as Record<string, unknown>;
  const props = schema.properties ?? {};
  const result: Record<string, unknown> = {};
  const usedInputKeys = new Set<string>();

  // Pass 1: exact matches
  for (const key of Object.keys(props)) {
    if (key in input) {
      result[key] = input[key];
      usedInputKeys.add(key);
    }
  }

  // Pass 2: normalised + Levenshtein matches for the rest
  const remainingSchemaKeys = Object.keys(props).filter((k) => !(k in result));
  const remainingInputKeys = Object.keys(input).filter((k) => !usedInputKeys.has(k));

  for (const schemaKey of remainingSchemaKeys) {
    const normSchema = normaliseKey(schemaKey);
    const limit =
      props[schemaKey].maxKeyDistance ??
      ctx.options.maxKeyDistance ??
      defaultDistanceFor(normSchema);

    let bestKey: string | null = null;
    let bestDist = Infinity;
    for (const inKey of remainingInputKeys) {
      if (usedInputKeys.has(inKey)) continue;
      const d = levenshtein(normSchema, normaliseKey(inKey));
      if (d < bestDist) {
        bestDist = d;
        bestKey = inKey;
      }
    }
    if (bestKey !== null && bestDist <= limit) {
      result[schemaKey] = input[bestKey];
      usedInputKeys.add(bestKey);
      if (bestKey !== schemaKey) {
        ctx.warnings.push(`${path}.${bestKey}: matched to schema field "${schemaKey}" (distance ${bestDist}).`);
      }
      ctx.score += bestDist === 0 ? 1 : 0.5;
    }
  }

  // Pass 3: required / defaults / unknown keys
  for (const key of Object.keys(props)) {
    const propSchema = props[key];
    const childPath = path ? `${path}.${key}` : key;
    if (key in result) {
      result[key] = coerceToSchema(result[key], propSchema, childPath, ctx);
      if (schema.required?.includes(key)) ctx.score += 1; // reward required hits
    } else if (ctx.options.applyDefaults && "default" in propSchema) {
      result[key] = propSchema.default;
      ctx.warnings.push(`${childPath}: missing — applied default ${JSON.stringify(propSchema.default)}.`);
    } else if (schema.required?.includes(key)) {
      ctx.errors.push(`${childPath}: required field is missing.`);
      ctx.score -= 2;
      result[key] = null;
    }
  }

  // Unmatched input keys
  for (const inKey of Object.keys(input)) {
    if (usedInputKeys.has(inKey)) continue;
    if (schema.additionalProperties) {
      result[inKey] = input[inKey];
    } else {
      ctx.warnings.push(`${path ? path + "." : ""}${inKey}: unknown field dropped.`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stage 6: putting it all together
// ---------------------------------------------------------------------------

export function defensiveJsonParser<T = unknown>(
  rawText: string,
  schema: JsonSchema,
  options: ParseOptions = {}
): ParseResult<T> {
  const opts: Required<ParseOptions> = {
    maxKeyDistance: options.maxKeyDistance ?? (undefined as unknown as number),
    coerceTypes: options.coerceTypes ?? true,
    applyDefaults: options.applyDefaults ?? true,
  };

  if (typeof rawText !== "string" || !rawText.trim()) {
    return { ok: false, data: null, warnings: [], errors: ["Input text is empty."] };
  }

  const candidates = extractCandidates(rawText);
  if (!candidates.length) {
    return { ok: false, data: null, warnings: [], errors: ["No JSON-like content found in input."] };
  }

  interface Attempt {
    data: unknown;
    ctx: CoerceCtx;
    sourceRank: number;
    length: number;
  }
  const attempts: Attempt[] = [];

  for (const cand of candidates) {
    const repairWarnings: string[] = [];
    let parsed: unknown;
    let parsedOk = false;

    // Try strict parse first; fall back to the repair pipeline.
    try {
      parsed = JSON.parse(cand.text);
      parsedOk = true;
    } catch {
      try {
        parsed = JSON.parse(repairJson(cand.text, repairWarnings));
        parsedOk = true;
      } catch {
        /* candidate unusable */
      }
    }
    if (!parsedOk) continue;

    const ctx: CoerceCtx = { options: opts, warnings: [...repairWarnings], errors: [], score: 0 };
    const data = coerceToSchema(parsed, schema, "", ctx);
    attempts.push({ data, ctx, sourceRank: cand.sourceRank, length: cand.text.length });
  }

  if (!attempts.length) {
    return {
      ok: false,
      data: null,
      warnings: [],
      errors: ["Found JSON-like content but could not parse it, even after repair."],
    };
  }

  // Pick the best attempt: fewest errors, highest schema score,
  // better source (fenced > loose), then longest.
  attempts.sort(
    (a, b) =>
      a.ctx.errors.length - b.ctx.errors.length ||
      b.ctx.score - a.ctx.score ||
      a.sourceRank - b.sourceRank ||
      b.length - a.length
  );
  const best = attempts[0];

  return {
    ok: best.ctx.errors.length === 0,
    data: best.data as T,
    warnings: best.ctx.warnings,
    errors: best.ctx.errors,
  };
}

export default defensiveJsonParser;
