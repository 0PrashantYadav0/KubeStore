# KubeStore — Kubernetes Store Provisioning Platform

> **Urumi AI SDE Internship — Round 1: System Design Assessment**
>
> A store provisioning platform that deploys fully-functional **MedusaJS** and **WooCommerce** e-commerce stores on Kubernetes. The same Helm charts run identically on a local Kind cluster and a production VPS (k3s), differing only via Helm values.

---

## Table of Contents

1. [Local Setup Instructions](#-local-setup-instructions)
2. [Create a Store & Place an Order](#-create-a-store--place-an-order)
3. [VPS / Production Setup (k3s)](#-vps--production-setup-k3s)
4. [Architecture Overview](#-architecture-overview)
5. [Project Structure](#-project-structure)
6. [API Reference](#-api-reference)
7. [Makefile Commands](#-makefile-commands)
8. [Assessment Checklist](#-assessment-checklist)

---

## 🚀 Local Setup Instructions

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker Desktop | Latest | Container runtime |
| [Kind](https://kind.sigs.k8s.io/) | v0.20+ | Local Kubernetes cluster |
| [Helm](https://helm.sh/) | v3.12+ | Chart-based deployments |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | v1.27+ | Cluster interaction |
| Go | 1.21+ | Backend compilation |
| Node.js | 18+ | Dashboard dev server |

### Step 1 — Clone & install dependencies

```bash
git clone https://github.com/0prashantyadav0/KubeStore.git
cd KubeStore

# Go backend
cd backend && go mod download && cd ..

# React dashboard
cd frontend && npm install && cd ..
```

### Step 2 — Create the Kind cluster

```bash
make kind-create          # Creates cluster with ingress-ready port mappings
make ingress-install      # Deploys NGINX Ingress Controller
make ingress-wait         # Blocks until the controller pod is ready
```

### Step 3 — Build & load Docker images

```bash
# Build all images (platform backend, dashboard, MedusaJS, storefront)
make docker-build-all

# Load them into the Kind cluster (imagePullPolicy: Never)
make kind-load
```

> **WooCommerce** uses official Docker Hub images (`wordpress:6-apache`, `mariadb:11`) with `imagePullPolicy: IfNotPresent`, so no custom build is required.

### Step 4 — Start the platform

```bash
# Terminal 1 — Go backend (runs on :8080)
make run

# Terminal 2 — React dashboard (runs on :5173)
cd frontend && npm run dev
```

### Step 5 — Open the dashboard

Navigate to **http://localhost:5173**. You can now create, monitor, and delete stores.

### Local domain approach

Every store gets an Ingress hostname of the form:

```
store-{storeId}.127.0.0.1.nip.io
```

[nip.io](https://nip.io) is a wildcard DNS service that resolves any `*.127.0.0.1.nip.io` address back to `127.0.0.1`. Combined with the Kind cluster's host-port mapping (ports 80/443), this gives each store a stable, unique URL without editing `/etc/hosts`.

---

## 🛒 Create a Store & Place an Order

### Via the Dashboard (recommended)

1. Click **"Create Store"** and enter a name. Choose **MedusaJS** or **WooCommerce** as the engine.
2. The status changes through **Provisioning → Ready**.
3. Click the **Store** / **Admin** links that appear.

### Via the REST API

```bash
# Create a MedusaJS store
curl -s -X POST http://localhost:8080/api/stores \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-shop","engine":"medusa"}' | jq

# Create a WooCommerce store
curl -s -X POST http://localhost:8080/api/stores \
  -H 'Content-Type: application/json' \
  -d '{"name":"wp-shop","engine":"woocommerce"}' | jq

# List all stores
curl -s http://localhost:8080/api/stores | jq

# Delete a store (removes namespace + all resources)
curl -s -X DELETE http://localhost:8080/api/stores/{storeId}
```

### Placing an order end-to-end (MedusaJS)

| Step | How |
|------|-----|
| 1. Open storefront | Click the **Store** link on the dashboard (redirects to `/us/`) |
| 2. Browse products | 10 seeded products with Unsplash images are available |
| 3. Add to cart | Click a product → select size/colour → **Add to Cart** |
| 4. Checkout | Go to Cart → Checkout → fill shipping address → select **Manual Payment** → **Place Order** |
| 5. Verify in admin | Open the **Admin** link → log in (credentials in K8s Secret, default `admin@medusa.local`) → Orders section |

> **Admin credentials** for a Kubernetes-deployed store:
> ```bash
> NS="store-{storeId}"
> kubectl -n $NS get secret {storeId}-medusa-store-secrets \
>   -o jsonpath='{.data.ADMIN_EMAIL}' | base64 -d && echo
> kubectl -n $NS get secret {storeId}-medusa-store-secrets \
>   -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d && echo
> ```

### Placing an order end-to-end (WooCommerce)

| Step | How |
|------|-----|
| 1. Open store | Click the **Store** link → WordPress setup wizard completes automatically |
| 2. Admin | Go to `/wp-admin/` → credentials from K8s Secret |
| 3. Install WooCommerce | Via Plugins → search "WooCommerce" → Install & Activate |
| 4. Add product & checkout | Add a sample product, visit shop, add to cart, checkout with COD |

---

## 🏭 VPS / Production Setup (k3s)

### 1. Install k3s on the VPS

```bash
curl -sfL https://get.k3s.io | sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

### 2. Push images to a registry (or load directly)

```bash
# Option A — push to a registry
docker tag kubestore-medusa:latest ghcr.io/<you>/kubestore-medusa:latest
docker push ghcr.io/<you>/kubestore-medusa:latest
# (repeat for kubestore-storefront, kubestore-backend, kubestore-dashboard)

# Option B — import directly on the VPS
docker save kubestore-medusa:latest | ssh vps 'sudo k3s ctr images import -'
```

### 3. Deploy using production Helm values

```bash
helm install my-store ./charts/medusa-store \
  -f charts/medusa-store/values-production.yaml \
  --set ingress.baseDomain=stores.yourdomain.com \
  --set store.id=my-store \
  --set store.name="My Store" \
  --namespace store-my-store --create-namespace
```

### What changes between Local and Production (Helm values only)

| Setting | Local (Kind) | Production (k3s / VPS) |
|---------|--------------|------------------------|
| `ingress.baseDomain` | `127.0.0.1.nip.io` | `stores.yourdomain.com` |
| `ingress.tls.enabled` | `false` | `true` (cert-manager) |
| `medusa.image.pullPolicy` | `Never` | `IfNotPresent` |
| `medusa.replicas` | `1` | `2` |
| `postgresql.storage.storageClass` | (default) | `local-path` |
| Resource requests/limits | Minimal | Production-sized |
| Secrets strategy | Helm `lookup` auto-gen | External secrets / Vault |

### Optional: TLS with cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

Then set in `values-production.yaml`:
```yaml
ingress:
  tls:
    enabled: true
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
```

---

## 🏗️ Architecture Overview

```
┌──────────────────┐     REST      ┌──────────────────┐      Helm       ┌───────────────────────────┐
│  React Dashboard │◄────────────►│  Go Backend       │────install────►│  Kubernetes Cluster       │
│  (Vite, :5173)   │              │  (chi, :8080)     │                │                           │
└──────────────────┘              │                    │                │  ┌──────────────────────┐  │
                                  │  • Rate Limiter    │                │  │ NS: store-{id}       │  │
                                  │  • Audit Logger    │                │  │                      │  │
                                  │  • Helm Client     │                │  │ Medusa  Deployment   │  │
                                  │  • Health Poller   │                │  │ Storefront Deployment│  │
                                  │  • BoltDB Repo     │                │  │ PostgreSQL SS + PVC  │  │
                                  └──────────────────┘                │  │ Redis   Deployment   │  │
                                                                       │  │ Ingress  / Services  │  │
                                                                       │  │ Secrets / ConfigMap  │  │
                                                                       │  │ ResourceQuota        │  │
                                                                       │  │ LimitRange           │  │
                                                                       │  │ NetworkPolicy        │  │
                                                                       │  │ RBAC (SA + Role)     │  │
                                                                       │  └──────────────────────┘  │
                                                                       └───────────────────────────┘
```

### Component Responsibilities

| Component | Tech | Responsibility |
|-----------|------|----------------|
| **Dashboard** | React + Vite | Store CRUD, status monitoring, logs/events/metrics/audit viewer |
| **Backend** | Go (chi) | REST API, Helm orchestration, health polling, rate limiting, audit logging, metrics |
| **Helm Client** | Helm CLI wrapper | Install / Upgrade / Rollback / Uninstall per-store releases |
| **BoltDB** | Embedded KV store | Persistent store records surviving backend restarts |
| **Medusa Chart** | Helm | MedusaJS + PostgreSQL + Redis + Next.js Storefront per namespace |
| **WooCommerce Chart** | Helm | WordPress + MariaDB per namespace |

---

## 📁 Project Structure

```
KubeStore/
├── backend/                        # Go backend
│   ├── cmd/server/main.go          # Entry point, config from env vars
│   ├── internal/
│   │   ├── api/                    # HTTP handlers + chi router
│   │   ├── helm/                   # Helm CLI wrapper (install/upgrade/rollback)
│   │   ├── middleware/             # Rate limiting + audit logging
│   │   ├── models/                 # Store model, errors, request/response types
│   │   ├── repository/            # BoltDB + in-memory repo
│   │   └── services/              # Store lifecycle, metrics, health, pods, logs
│   └── Dockerfile
├── frontend/                       # React dashboard
│   ├── src/App.jsx                 # Main component (stores, metrics, audit tabs)
│   ├── src/api/stores.js           # API client
│   └── Dockerfile                  # Nginx-based production image
├── charts/
│   ├── medusa-store/               # Per-store MedusaJS Helm chart
│   │   ├── templates/              # 12 templates (deployment, statefulset, ingress, etc.)
│   │   ├── values.yaml             # Local defaults
│   │   ├── values-local.yaml       # Kind-specific overrides
│   │   └── values-production.yaml  # VPS / k3s production values
│   ├── woocommerce-store/          # Per-store WooCommerce Helm chart
│   │   ├── templates/              # 9 templates (wordpress, mariadb, ingress, etc.)
│   │   ├── values.yaml             # Local defaults
│   │   └── values-production.yaml  # VPS / k3s production values
│   └── kubestore-platform/         # Platform chart (backend + dashboard)
├── engines/
│   └── medusa/
│       ├── medusa-starter-default/ # MedusaJS v2 backend (Dockerfile, seed, config)
│       └── nextjs-starter-medusa/  # Next.js v15 storefront (Dockerfile, middleware)
├── scripts/
│   └── kind-config.yaml            # Kind cluster config with port mappings
├── Makefile                        # Build automation (30+ targets)
├── README.md                       # This file
└── SYSTEM_DESIGN.md                # Architecture & tradeoffs document
```

---

## 📊 API Reference

### Store Lifecycle

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/stores` | Create store `{"name":"...","engine":"medusa\|woocommerce"}` |
| `GET` | `/api/stores` | List all stores (sorted by creation time) |
| `GET` | `/api/stores/{id}` | Get single store |
| `DELETE` | `/api/stores/{id}` | Delete store + namespace + all resources |

### Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/stores/{id}/upgrade` | Helm upgrade with new values |
| `POST` | `/api/stores/{id}/rollback` | Helm rollback to revision `{"revision":1}` |
| `POST` | `/api/stores/{id}/restart` | Restart all pods in the store |
| `GET` | `/api/stores/{id}/health` | Live health check (engine-aware) |
| `GET` | `/api/stores/{id}/pods` | Pod status + CPU/memory usage |
| `GET` | `/api/stores/{id}/logs?component=medusa&lines=100` | Component logs |
| `GET` | `/api/stores/{id}/events` | Kubernetes events |
| `GET` | `/api/stores/{id}/history` | Helm release history |

### Platform

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Backend health check |
| `GET` | `/metrics` | Prometheus-format metrics |
| `GET` | `/api/metrics` | JSON platform metrics |
| `GET` | `/api/audit` | Audit log (who created/deleted what, when) |

---

## 🧪 Makefile Commands

```bash
# ── Development ──
make run                    # Start Go backend locally
make build                  # Compile Go binary
make test                   # Run unit tests

# ── Docker ──
make docker-build-all       # Build platform + all engine images
make docker-build-medusa    # Build MedusaJS image only
make docker-build-storefront # Build Next.js storefront image only

# ── Kind Cluster ──
make kind-create            # Create Kind cluster with ingress port mappings
make kind-delete            # Tear down cluster
make kind-load              # Load all images into Kind

# ── Ingress ──
make ingress-install        # Deploy NGINX Ingress Controller
make ingress-wait           # Wait for controller readiness

# ── Helm ──
make helm-lint              # Lint all Helm charts (medusa + woocommerce)
make helm-template          # Dry-run template rendering

# ── Frontend ──
make frontend-dev           # Start Vite dev server
make frontend-build         # Production build
```

---

## ✅ Assessment Checklist

### Mandatory Requirements

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| React dashboard to view/create/delete stores | Done | `frontend/src/App.jsx` |
| Status, URL, created timestamp per store | Done | Store model + dashboard cards |
| MedusaJS engine (fully functional) | Done | `charts/medusa-store/`, `engines/medusa/` |
| WooCommerce engine | Done | `charts/woocommerce-store/` (WordPress + MariaDB) |
| End-to-end order placement | Done | Seeded products, Manual Payment, checkout flow |
| Local Kubernetes (Kind) | Done | `scripts/kind-config.yaml`, `make kind-create` |
| Same Helm charts for production (k3s) | Done | `values-production.yaml` per chart |
| Helm mandatory (no Kustomize) | Done | Two Helm charts + platform chart |
| Local vs prod via Helm values only | Done | `values.yaml` / `values-local.yaml` / `values-production.yaml` |
| K8s-native provisioning | Done | Deployments, StatefulSets, Services, Ingress, PVCs, Secrets |
| Namespace-per-store isolation | Done | `store-{id}` namespace per store |
| Persistent database storage | Done | PostgreSQL PVC (Medusa), MariaDB PVC (WooCommerce) |
| Ingress with stable URLs | Done | `store-{id}.127.0.0.1.nip.io` via nip.io |
| Readiness / liveness probes | Done | HTTP + TCP probes on all containers |
| Clean teardown | Done | Helm uninstall + namespace delete |
| No hardcoded secrets | Done | Helm `lookup` + auto-generation in K8s Secrets |

### Ways to Stand Out (all implemented)

| Feature | Status | Implementation |
|---------|--------|----------------|
| **1. Production VPS deployment** | Done | `values-production.yaml`, cert-manager TLS notes |
| **2. Multi-tenant isolation** | Done | ResourceQuota + LimitRange + max PVC per namespace |
| **3. Idempotency & recovery** | Done | User+name dedup, BoltDB persistence, reconciliation loop |
| **4. Abuse prevention** | Done | Rate limiting, per-user quotas, provisioning timeouts, audit log |
| **5. Observability** | Done | Events, metrics, pod status, logs, failure reasons in dashboard |
| **6. Network & security hardening** | Done | NetworkPolicy deny-by-default, RBAC, non-root containers |
| **7. Scaling plan (implemented)** | Done | Bounded worker pool, concurrent provisioning controls |
| **8. Upgrades & rollback** | Done | `POST /upgrade`, `POST /rollback`, Helm history API |

---

## 📄 License

MIT — This code is for assessment purposes. Copyright belongs to the author.
