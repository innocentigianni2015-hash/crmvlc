import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders the public landing with development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const body = await response.text();
  assert.match(body, developmentPreviewMeta);
  assert.match(body, /Tu marca/);
  assert.match(body, /Solicitar una llamada/);
  assert.match(body, /data-scroll-target="opportunita"/);
  assert.match(body, /data-scroll-target="chi-siamo"/);
  assert.match(body, /data-scroll-target="metodo"/);
  assert.match(body, /data-scroll-target="contatti"/);
  assert.doesNotMatch(body, /href="#(?:top|opportunita|chi-siamo|metodo|contatti)"/);
});

test("renders the trilingual sales application page", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("careers", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/lavora-con-noi", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Conviértete en el referente comercial/);
  assert.match(body, /Colaboración a comisión/);
  assert.match(body, /Candidatura comercial/);
  assert.match(body, /Enviar candidatura/);
});
