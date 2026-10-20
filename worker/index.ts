import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleCrmApi, processEmailOutbox, processR2DeletionQueue } from "./crm-api";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const apiResponse = await handleCrmApi(request, env, ctx);
      if (apiResponse) return withSecurityHeaders(apiResponse);
    }

    if (request.method === "GET" && url.pathname === "/") {
      const landingUrl = new URL(request.url);
      landingUrl.pathname = "/landing";
      return withSecurityHeaders(await handler.fetch(new Request(landingUrl, request), env, ctx));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format: imageFormat(format), quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.all([processEmailOutbox(env), processR2DeletionQueue(env)]).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;

function imageFormat(value: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif" | "rgb" | "rgba" {
  const supported = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "rgb", "rgba"] as const;
  return supported.find((format) => format === value) ?? "image/webp";
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  secured.headers.set("permissions-policy", "camera=(self), microphone=(self), geolocation=(self)");
  return secured;
}

export default worker;

