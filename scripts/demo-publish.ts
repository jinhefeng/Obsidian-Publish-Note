import { compileNote } from "../src/compiler/site-compiler.ts";
import { InMemoryPublisher } from "../src/publish/in-memory-publisher.ts";
import { serveLocalSite } from "../src/publish/local-viewer.ts";

const publisher = new InMemoryPublisher();
const bundle = compileNote({
  sourcePath: "Demo/Welcome.md",
  title: "Welcome",
  markdown: "# Welcome\n\nThis page was published by the local MVP vertical slice.",
});
const result = publisher.publish({ idempotencyKey: "demo-publish", bundle });
const response = serveLocalSite(publisher, result.siteId);

console.log(JSON.stringify({ result, status: response.status, htmlPreview: response.body.slice(0, 120) }, null, 2));
