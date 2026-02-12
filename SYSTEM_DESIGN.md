# System Design & Tradeoffs — KubeStore

> Short design note covering architecture choices, idempotency/failure handling, cleanup approach, and what changes for production.

---

## 1. Architecture Choice

### Why this stack?

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Orchestration API** | Go + chi | Lightweight, fast startup, single binary, first-class Kubernetes client support |
| **Dashboard** | React + Vite | Fast dev iteration, simple SPA for CRUD + observability |
| **Store metadata** | BoltDB (embedded) | Zero operational overhead, survives backend restarts, no extra infra |
| **Packaging** | Helm (mandatory) | Templated K8s manifests, values-based local/prod switching, upgrade/rollback built-in |
| **E-commerce (primary)** | MedusaJS v2 | Modern headless commerce, PostgreSQL-backed, API-first, separate admin + storefront |
| **E-commerce (secondary)** | WooCommerce | WordPress + MariaDB, well-known, proves multi-engine architecture |
| **Ingress** | NGINX Ingress + nip.io | Works on Kind out of the box, same controller on k3s |

### Multi-engine architecture

The platform is engine-agnostic. Each engine is a separate Helm chart:

```
CreateStore(name, engine) ──►  Resolve chart path ──►  helm install ──►  Wait for health ──► Bootstrap (engine-specific)
                                    │                                         │
                         medusa → charts/medusa-store/             /health (Medusa)
                         woocommerce → charts/woocommerce-store/   /wp-login.php (WordPress)
```

Adding a new engine (e.g., Shopify self-hosted) requires only:
1. A new Helm chart in `charts/`
2. A health endpoint mapping in `store_service.go`
3. A chart path in the backend config

### End-to-end flow

```
User clicks "Create Store"
         │
    ┌────▼────┐
    │ POST    │ ── rate limit check ── per-user quota check ── idempotency check
    │ /stores │
    └────┬────┘
         │ Store record created (status: provisioning)
         │ Audit log entry written
         │
    ┌────▼──────────┐
    │ Worker Pool   │ (bounded goroutine pool, default 3 workers)
    │ provisionStore│
    └────┬──────────┘
         │ 1. Create namespace: store-{id}
         │ 2. helm install with engine-specific chart
         │ 3. Poll health endpoint (up to 10 min)
         │ 4. Bootstrap (Medusa: fetch publishable API key, inject into storefront)
         │ 5. Update store → status: ready, set URL + admin URL
         │
    ┌────▼────────┐
    │ Dashboard   │ polls /api/stores every 5s → user sees status change
    └─────────────┘
```

---

## 2. Isolation Model (Namespace-per-Store)

Each store gets its own Kubernetes namespace (`store-{id}`) containing:

| Resource | Purpose |
|----------|---------|
| **Deployments** | Medusa backend, Next.js storefront, Redis (or) WordPress |
| **StatefulSet** | PostgreSQL (Medusa) or MariaDB (WooCommerce) with PVC |
| **Services** | ClusterIP for inter-pod communication |
| **Ingress** | External hostname: `store-{id}.{domain}` |
| **Secrets** | DB passwords, JWT secret, admin credentials (auto-generated, stable via `lookup`) |
| **ConfigMap** | Non-secret configuration |
| **ResourceQuota** | Max CPU, memory, PVCs, pods per namespace |
| **LimitRange** | Default requests/limits for any pod in the namespace |
| **NetworkPolicy** | Deny-by-default ingress/egress with explicit allows |
| **RBAC** | ServiceAccount + Role + RoleBinding scoped to namespace |

### Why namespace-per-store?

- **Blast-radius control**: A misbehaving store cannot affect others.
- **ResourceQuota**: Prevents any single store from starving the cluster.
- **NetworkPolicy**: Deny-by-default means stores cannot communicate with each other.
- **Clean teardown**: `kubectl delete namespace store-{id}` removes everything atomically.
- **Secrets isolation**: Each namespace has its own secrets; no cross-store leakage.

---

## 3. Idempotency & Failure Handling

### Store creation idempotency

1. **User+name deduplication**: Creating a store with the same name by the same user returns the existing store instead of creating a duplicate.
2. **Helm idempotency**: If a Helm release already exists (e.g., from a previous partial provision), the system detects it and continues from where it left off.
3. **Stable secrets**: Secrets use Helm `lookup` — if a secret already exists in the namespace, its values are reused rather than regenerated. This prevents credential drift on retries.
4. **Seed script idempotency**: The Medusa seed script checks for existing products before seeding, preventing duplicate data.

### Failure recovery

| Failure scenario | Recovery mechanism |
|-----------------|-------------------|
| Backend restarts mid-provision | BoltDB persists store records; reconciliation loop on startup detects `provisioning` stores and retries |
| Helm install fails | Store marked `failed` with error message; user can retry or delete |
| Health check times out | Store marked `failed` with timeout reason; partial resources cleaned up on delete |
| Medusa bootstrap fails | Non-fatal — store is still usable, key can be injected manually |
| OOMKilled pod | Kubernetes restarts via `restartPolicy: Always`; readiness probes prevent traffic until ready |

### Cleanup guarantees

Deleting a store:
1. Calls `helm uninstall` to remove the release
2. Deletes the namespace (which cascades to all resources including PVCs)
3. Removes the store record from BoltDB
4. Writes an audit log entry

Even if `helm uninstall` fails, the namespace deletion acts as a safety net to remove all resources.

---

## 4. Security Posture

### Secret handling
- No secrets in source code or Helm values files
- Secrets auto-generated at install time using `randAlphaNum` + Helm `lookup` for stability
- JWT secret, cookie secret, DB passwords, admin credentials all generated per-store
- Production: integrate with external secret managers (Vault, AWS Secrets Manager)

### RBAC (least privilege)
- Each store namespace has a dedicated ServiceAccount
- Role scoped to the namespace with only required verbs (get, list, watch on pods/services)
- No cluster-wide permissions for store workloads
- The platform backend runs with broader permissions (required for namespace creation + Helm operations)

### Network hardening
- **NetworkPolicy deny-by-default** on every store namespace
- Explicit ingress allows: only from ingress controller to web-facing pods
- Explicit egress allows: only required inter-pod traffic + DNS + external HTTPS (for image CDN)
- PostgreSQL/MariaDB only accept connections from the application pod

### Container hardening
- Containers run as non-root where possible (`runAsNonRoot: true`, `runAsUser: 1000`)
- Read-only root filesystem where possible
- Resource limits on all containers (prevents runaway resource consumption)

---

## 5. Abuse Prevention

| Control | Implementation |
|---------|----------------|
| **IP-based rate limiting** | Token bucket middleware (10 req/s burst, 5 req/s sustained) |
| **Per-user store quota** | Default max 5 stores per user (configurable via `MAX_STORES_PER_USER`) |
| **Global store limit** | Default max 50 total stores (configurable via `MAX_STORES_TOTAL`) |
| **Provisioning timeout** | 10-minute health check timeout; store marked `failed` on expiry |
| **ResourceQuota per store** | Limits CPU, memory, PVCs, and pod count per namespace |
| **Audit trail** | Every create/delete action logged with user, IP, timestamp, and result |

---

## 6. Observability

### Dashboard features
- **Store status**: Real-time provisioning / ready / failed with colour-coded indicators
- **Health checks**: Per-component health (Medusa, PostgreSQL, Redis, Storefront or WordPress, MariaDB)
- **Pod viewer**: Live pod status, restarts, CPU/memory usage
- **Log viewer**: Per-component log streaming (selectable: medusa, storefront, postgresql, redis, wordpress, mariadb)
- **Events**: Kubernetes events for the store namespace
- **Helm history**: Release revisions, timestamps, status
- **Failure reasons**: Clear error messages when provisioning fails

### Metrics (JSON + Prometheus)
- `GET /api/metrics` — JSON: total stores, by status, by engine, provisioning durations
- `GET /metrics` — Prometheus format for scraping

### Audit log
- `GET /api/audit` — Full action log (create, delete, upgrade, rollback, restart)

---

## 7. Horizontal Scaling Plan

### What scales horizontally

| Component | Scaling approach |
|-----------|-----------------|
| **React Dashboard** | Stateless — scale replicas behind a load balancer |
| **Go Backend** | Stateless API layer scales horizontally; BoltDB replaced with PostgreSQL/Redis for shared state |
| **Provisioning workers** | Bounded worker pool (`PROVISION_WORKERS` env var); increase workers per replica |
| **NGINX Ingress** | DaemonSet on all nodes (default in production) |

### Stateful constraints

| Component | Constraint | Mitigation |
|-----------|-----------|------------|
| BoltDB | Single-writer, embedded | Replace with PostgreSQL for multi-replica backend |
| PostgreSQL (per store) | Single-instance StatefulSet | Promote to HA (Patroni/PGO) in production values |
| Helm operations | Must be serialized per release | Worker pool ensures no concurrent operations on same store |

### Provisioning throughput

- Default: 3 concurrent provisions (`PROVISION_WORKERS=3`)
- Each provision is independent (separate namespace, separate Helm release)
- Cluster resources are the bottleneck, not the backend
- ResourceQuotas prevent any single store from starving others

---

## 8. What Changes for Production

### Helm values differences

| Dimension | Local (Kind) | Production (k3s / VPS) |
|-----------|-------------|------------------------|
| **Domain** | `127.0.0.1.nip.io` | `stores.yourdomain.com` |
| **TLS** | Disabled | cert-manager + Let's Encrypt |
| **Image pull** | `pullPolicy: Never` (pre-loaded) | `IfNotPresent` (from registry) |
| **Replicas** | 1 per component | 2+ for Medusa, storefront |
| **Resources** | Minimal requests/limits | Production-sized (2Gi+ memory) |
| **Storage class** | Default (rancher local-path) | Provisioner-backed (EBS, Ceph, etc.) |
| **Secrets** | Auto-generated (Helm lookup) | External secrets manager (Vault) |
| **Ingress controller** | Kind-specific NodePort | Cloud LB / k3s Traefik / NGINX |
| **Monitoring** | JSON metrics endpoint | Prometheus + Grafana stack |

### Upgrade & rollback approach

```bash
# Upgrade a store to new image version
curl -X POST http://localhost:8080/api/stores/{id}/upgrade \
  -H 'Content-Type: application/json' \
  -d '{"values":{"medusa.image.tag":"v2.1"}}'

# Rollback to previous revision
curl -X POST http://localhost:8080/api/stores/{id}/rollback \
  -H 'Content-Type: application/json' \
  -d '{"revision":1}'

# View release history
curl http://localhost:8080/api/stores/{id}/history
```

Helm maintains a full revision history per release. Rollback is atomic — if the new revision fails health checks, the old revision's pods remain running until explicitly replaced.

---

## 9. Tradeoffs & Future Improvements

| Decision | Tradeoff | Future improvement |
|----------|----------|-------------------|
| BoltDB for metadata | Simple, zero-ops, but single-writer | Migrate to PostgreSQL for multi-replica backend |
| Helm CLI wrapper | Shell-out to Helm binary; simple but less control | Use Helm SDK (Go library) for programmatic control |
| `nip.io` for local DNS | No `/etc/hosts` edits needed; depends on external DNS | Support custom domains with TLS in production |
| Single-stage Docker builds | Larger images but simpler, fewer layer cache issues | Multi-stage with BuildKit cache mounts |
| Monorepo structure | Everything in one repo for assessment; harder to version independently | Split engines into separate repos with Git submodules or a registry |
| Manual Payment (Medusa) | Simplest checkout for assessment demo | Stripe test mode integration |
| WordPress without WooCommerce pre-installed | WooCommerce must be activated manually after deploy | Bake WooCommerce + theme into a custom image |

---

## 10. Readiness for Round 2 (Gen AI Orchestration)

The platform's REST API is designed to be called programmatically by an AI orchestration layer:

- **Structured API**: JSON request/response for all operations
- **Status polling**: AI agent can poll `/api/stores/{id}` until `status: ready`
- **Observability APIs**: Health, pods, logs, events — all queryable for AI debugging
- **Audit trail**: Full action log for AI traceability
- **Idempotent operations**: Safe to retry (no duplicate resources)
- **Multi-engine support**: AI can choose `medusa` or `woocommerce` based on requirements

The architecture is ready for an AI agent to:
1. Call `POST /api/stores` to create a store
2. Poll status until ready
3. Configure the store via Medusa Admin API or WordPress REST API
4. Verify order placement via API
5. Clean up via `DELETE /api/stores/{id}`
