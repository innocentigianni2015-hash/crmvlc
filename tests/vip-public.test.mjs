import assert from "node:assert/strict";
import test from "node:test";
import { vipCookie, verifyVipToken } from "../worker/vip-public-api.ts";

test("issues one opaque VIP cookie for both the page and API paths", async () => {
  const header = await vipCookie(
    "member-123",
    new Request("https://crmvlc.com/api/vip/register"),
    { AUTH_SECRET: "test-secret-with-enough-entropy" },
  );

  assert.match(header, /^vlc_vip_member=/);
  assert.match(header, /; Path=\/;/);
  assert.match(header, /; HttpOnly;/);
  assert.match(header, /; SameSite=Lax;/);
  assert.match(header, /; Secure$/);

  const token = decodeURIComponent(header.split(";", 1)[0].split("=", 2)[1]);
  assert.equal(await verifyVipToken(token, "test-secret-with-enough-entropy"), "member-123");
  assert.equal(await verifyVipToken(token, "wrong-secret"), null);
});
