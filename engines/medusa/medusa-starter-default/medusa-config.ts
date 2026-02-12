import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  admin: {
    // In dev: allow all hosts so Vite doesn't reject Ingress hostnames
    // In prod: admin is pre-built static files, vite config is ignored
    vite: () => ({
      server: {
        allowedHosts: true,
      },
    }),
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      // STORE_CORS: storefront origins that call /store/* APIs
      storeCors: process.env.STORE_CORS!,
      // ADMIN_CORS: admin panel origins that call /admin/* APIs
      adminCors: process.env.ADMIN_CORS!,
      // AUTH_CORS: origins that call /auth/* (login/register) — must include
      // BOTH admin and storefront URLs, otherwise browser CORS blocks auth requests.
      authCors: process.env.AUTH_CORS || process.env.STORE_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
})
