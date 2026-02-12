const c = require("ansi-colors")

const requiredEnvs = [
  {
    key: "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY",
    // TODO: we need a good doc to point this to
    description:
      "Learn how to create a publishable key: https://docs.medusajs.com/v2/resources/storefront-development/publishable-api-keys",
  },
]

function checkEnvVariables() {
  const missingEnvs = requiredEnvs.filter(function (env) {
    // Also accept MEDUSA_PUBLISHABLE_KEY (runtime override used in K8s)
    if (env.key === "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY") {
      return !process.env[env.key] && !process.env["MEDUSA_PUBLISHABLE_KEY"]
    }
    return !process.env[env.key]
  })

  if (missingEnvs.length > 0) {
    // In Kubernetes, the key is injected at runtime from K8s Secrets.
    // Warn but don't crash — the middleware will handle the missing key.
    console.warn(
      c.yellow.bold("\n⚠ Warning: Missing environment variables\n")
    )

    missingEnvs.forEach(function (env) {
      console.warn(c.yellow(`  ${c.bold(env.key)}`))
      if (env.description) {
        console.warn(c.dim(`    ${env.description}\n`))
      }
    })

    console.warn(
      c.yellow(
        "\nThe storefront may not function correctly until these are set.\n"
      )
    )
  }
}

module.exports = checkEnvVariables
