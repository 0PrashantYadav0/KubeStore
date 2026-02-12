import { defineMiddlewares } from "@medusajs/medusa"
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * Strip the "Secure" flag from Set-Cookie headers when the inbound request
 * arrived over plain HTTP.
 *
 * In local Kind clusters NODE_ENV=production but stores are accessed via
 * HTTP (not HTTPS).  Medusa's /auth/session endpoint sets a session cookie
 * with  Secure; …  which browsers silently reject over HTTP — breaking
 * admin login (POST /auth/session → 200, but GET /admin/users/me → 401).
 *
 * This middleware patches both res.setHeader and res.appendHeader so every
 * Set-Cookie produced by downstream handlers has the flag removed.
 */
function stripSecureCookiesForHttp(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const isHttps =
    req.secure || req.headers["x-forwarded-proto"] === "https"

  if (!isHttps) {
    const strip = (val: any): any => {
      if (Array.isArray(val)) {
        return val.map((v: string) =>
          typeof v === "string" ? v.replace(/;\s*[Ss]ecure/g, "") : v
        )
      }
      if (typeof val === "string") {
        return val.replace(/;\s*[Ss]ecure/g, "")
      }
      return val
    }

    // Patch setHeader — used by Express res.cookie() internally
    const origSetHeader = res.setHeader.bind(res)
    res.setHeader = function (name: string, value: any) {
      if (name.toLowerCase() === "set-cookie") {
        value = strip(value)
      }
      return origSetHeader(name, value)
    } as typeof res.setHeader

    // Patch appendHeader / append (Express uses append for cookies too)
    if (typeof (res as any).append === "function") {
      const origAppend = (res as any).append.bind(res)
      ;(res as any).append = function (name: string, value: any) {
        if (name.toLowerCase() === "set-cookie") {
          value = strip(value)
        }
        return origAppend(name, value)
      }
    }
  }

  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/auth/*",
      middlewares: [stripSecureCookiesForHttp],
    },
    {
      matcher: "/admin/*",
      middlewares: [stripSecureCookiesForHttp],
    },
  ],
})
