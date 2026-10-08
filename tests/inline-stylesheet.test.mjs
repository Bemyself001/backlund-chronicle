import assert from "node:assert/strict";
import test from "node:test";
import { rebaseInlineStylesheet } from "../scripts/inline-stylesheet.mjs";

test("inline backgrounds keep their stylesheet asset location on root and repository sites", () => {
  const css = '.paper{background:url(./ui-archive-day.png)}.night{background:url("./ui-archive-night.png?v=1#art")}';
  const result = rebaseInlineStylesheet(css, "./assets/index.css");
  assert.ok(result.includes("url(./assets/ui-archive-day.png)"));
  assert.ok(result.includes('url("./assets/ui-archive-night.png?v=1#art")'));
  for (const page of ["https://example.test/", "https://example.test/backlund-chronicle/"]) {
    const stylesheet = new URL("./assets/index.css", page);
    assert.equal(new URL("./assets/ui-archive-day.png", page).href, new URL("./ui-archive-day.png", stylesheet).href);
    assert.equal(new URL("./assets/ui-archive-night.png?v=1#art", page).href, new URL("./ui-archive-night.png?v=1#art", stylesheet).href);
  }
});

test("inline font URLs resolve at the document's copied font directory", () => {
  const css = '@font-face{src:url(../fonts/font.woff2)}.brand{src:url("/fonts/title.woff2")}';
  assert.equal(rebaseInlineStylesheet(css, "./assets/index.css"),
    '@font-face{src:url(./fonts/font.woff2)}.brand{src:url("./fonts/title.woff2")}');
});

test("inline stylesheet preserves data, external, fragment and root URLs", () => {
  const css = '.a{background:url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")}.b{mask:url(#mask)}.c{src:url(https://cdn.example/font.woff2)}.d{src:url(//cdn.example/font.woff2)}.e{background:url(/shared/bg.png)}';
  assert.equal(rebaseInlineStylesheet(css, "./assets/index.css"), css);
});
