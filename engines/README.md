This folder contains **store engines** (e.g. Medusa, WooCommerce).

- Each engine should be self-contained and provide a Docker build context.
- The platform Helm charts reference engine images via Helm values (so you can swap/upgrade engines without changing the platform code).

