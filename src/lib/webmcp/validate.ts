import type { SchemaNode } from "./types";

/**
 * Validates tool input against the tool's JSON Schema (the subset this project uses: type, enum,
 * minimum/maximum, minLength/maxLength, minItems/maxItems, properties/required, items).
 * Browsers hand the schema to the model but do not enforce it, and Chrome's guidance is to
 * "validate strictly in code, loosely in schema". Numeric strings are accepted for numbers; NaN,
 * Infinity and wrong types are rejected with a message the agent can act on. Unknown keys are
 * dropped and `null` counts as "not provided" for optional fields.
 */
export function validateInput(
  schema: SchemaNode,
  input: unknown,
): Record<string, unknown> {
  const errors: string[] = [];
  const value = check(schema, input ?? {}, "", errors);
  if (errors.length > 0) throw new Error(errors.join(" "));
  return (value ?? {}) as Record<string, unknown>;
}

function check(
  schema: SchemaNode,
  value: unknown,
  path: string,
  errors: string[],
): unknown {
  const label = path || "input";
  const types = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];

  let v = value;
  if (
    typeof v === "string" &&
    (types.includes("number") || types.includes("integer")) &&
    !types.includes("string") &&
    v.trim() !== "" &&
    Number.isFinite(Number(v))
  ) {
    v = Number(v);
  }

  if (types.length > 0 && !types.some((t) => matches(t, v))) {
    errors.push(`${label} must be ${describe(types)}, got ${show(v)}.`);
    return undefined;
  }

  if (schema.enum && !schema.enum.includes(v)) {
    errors.push(
      `${label} must be one of ${schema.enum.map(String).join(", ")}, got ${show(v)}.`,
    );
    return undefined;
  }

  if (typeof v === "number") {
    const { minimum: min, maximum: max } = schema;
    if ((min !== undefined && v < min) || (max !== undefined && v > max)) {
      errors.push(`${label} must be ${range(min, max)}, got ${show(v)}.`);
      return undefined;
    }
  }

  if (typeof v === "string") {
    if (schema.maxLength !== undefined && v.length > schema.maxLength) {
      errors.push(`${label} must be at most ${schema.maxLength} characters.`);
      return undefined;
    }
    if (schema.minLength !== undefined && v.length < schema.minLength) {
      errors.push(`${label} must be at least ${schema.minLength} characters.`);
      return undefined;
    }
  }

  if (Array.isArray(v)) {
    if (schema.maxItems !== undefined && v.length > schema.maxItems) {
      errors.push(`${label} must have at most ${schema.maxItems} items.`);
      return undefined;
    }
    if (schema.minItems !== undefined && v.length < schema.minItems) {
      errors.push(`${label} must have at least ${schema.minItems} items.`);
      return undefined;
    }
    const items = schema.items;
    return items
      ? v.map((item, i) => check(items, item, `${label}[${i}]`, errors))
      : v;
  }

  if (v !== null && typeof v === "object" && schema.properties) {
    const record = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const raw = record[key];
      const childPath = path ? `${path}.${key}` : key;
      if (raw === undefined || raw === null) {
        if (schema.required?.includes(key))
          errors.push(`${childPath} is required.`);
        continue;
      }
      const cleaned = check(propSchema, raw, childPath, errors);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }

  return v;
}

function matches(type: string, v: unknown) {
  switch (type) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    case "object":
      return v !== null && typeof v === "object" && !Array.isArray(v);
    default:
      return true;
  }
}

function describe(types: string[]) {
  return types
    .map((t) =>
      t === "integer" || t === "array" || t === "object" ? `an ${t}` : `a ${t}`,
    )
    .join(" or ");
}

function range(min: number | undefined, max: number | undefined) {
  if (min !== undefined && max !== undefined)
    return `between ${min} and ${max}`;
  if (min !== undefined) return `at least ${min}`;
  return `at most ${max}`;
}

function show(v: unknown) {
  try {
    const text = JSON.stringify(v);
    return text === undefined
      ? String(v)
      : text.length > 40
        ? text.slice(0, 37) + "..."
        : text;
  } catch {
    return String(v);
  }
}
