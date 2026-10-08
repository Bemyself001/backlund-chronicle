// Moving a stylesheet into HTML changes the base used for relative asset URLs.
export function rebaseInlineStylesheet(stylesheet, stylesheetHref) {
  const base = new URL(stylesheetHref, "https://build.invalid/");
  return stylesheet.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi, (match, quote, quoted, unquoted) => {
    const reference = (quoted ?? unquoted).trim();
    if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return match;
    if (reference.startsWith("/fonts/")) return `url(${quote || ""}.${reference}${quote || ""})`;
    if (reference.startsWith("/")) return match;
    const resolved = new URL(reference, base);
    return `url(${quote || ""}.${resolved.pathname}${resolved.search}${resolved.hash}${quote || ""})`;
  });
}
