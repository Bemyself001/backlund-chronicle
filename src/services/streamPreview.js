function decodePartialJsonString(source) {
  let output = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') return output;
    if (character !== "\\") {
      output += character;
      continue;
    }
    const escaped = source[index + 1];
    if (!escaped) break;
    const simple = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
    if (escaped === "u") {
      const code = source.slice(index + 2, index + 6);
      if (!/^[0-9a-f]{4}$/i.test(code)) break;
      output += String.fromCharCode(Number.parseInt(code, 16));
      index += 5;
    } else {
      output += simple[escaped] ?? escaped;
      index += 1;
    }
  }
  return output;
}

export function extractNarrativePreview(rawContent) {
  const raw = String(rawContent || "");
  const narrative = /"(?:narrative|response|output_text|text)"\s*:\s*"/.exec(raw);
  if (narrative) return decodePartialJsonString(raw.slice(narrative.index + narrative[0].length));
  const trimmed = raw.trimStart().replace(/^```(?:json)?\s*/i, "");
  if (trimmed.startsWith("{") || trimmed.startsWith("```")) return "";
  return raw;
}
