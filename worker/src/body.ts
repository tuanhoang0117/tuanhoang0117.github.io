import { MAX_BODY_BYTES, MAX_INCREMENT } from "./limits";

export type ParsedIncrement = { ok: true; by: number } | { ok: false; error: string };

/** Validates a POST /increment body: exactly `{ "by": <integer 1..MAX_INCREMENT> }` as JSON. */
export async function parseIncrement(request: Request): Promise<ParsedIncrement> {
  const type = request.headers.get("Content-Type") ?? "";
  if (type.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { ok: false, error: "content_type_must_be_json" };
  }

  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) return { ok: false, error: "body_too_large" };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "body_must_be_object" };
  }
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== "by") {
    return { ok: false, error: "body_must_only_have_by" };
  }
  const by: unknown = (data as { by: unknown }).by;
  if (typeof by !== "number" || !Number.isInteger(by) || by < 1 || by > MAX_INCREMENT) {
    return { ok: false, error: `by_must_be_integer_1_to_${MAX_INCREMENT}` };
  }
  return { ok: true, by };
}

/** Reads the body as text, or returns null as soon as it exceeds `max` bytes. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
