# KubeStore - Kubernetes Store Provisioning Platform

> **Urumi AI SDE Internship - Round 1 Assessment**  
> Kubernetes-native store provisioning with MedusaJS, Go backend, and React dashboard.

## 🎯 Overview

KubeStore is a store provisioning platform that deploys fully-functional MedusaJS e-commerce stores on Kubernetes. The same Helm charts work on local Kind clusters and production VPS (k3s).

### Features

- ✅ **Multi-Store Support** - Provision multiple isolated stores concurrently
- ✅ **Namespace Isolation** - Each store runs in its own namespace
- ✅ **End-to-End Orders** - Place orders via MedusaJS storefront
- ✅ **Clean Teardown** - Delete stores and all resources safely
- ✅ **Rate Limiting** - Abuse prevention with per-user quotas
- ✅ **Audit Logging** - Track all actions for compliance
- ✅ **NetworkPolicies** - Deny-by-default network isolation
- ✅ **RBAC** - Least-privilege ServiceAccounts
- ✅ **ResourceQuotas** - Limits per store namespace
- ✅ **Observability** - Events, metrics, and failure reporting
- ✅ **Upgrade/Rollback** - Helm revision management

---

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐
│  React Dashboard│───▶│   Go Backend    │───▶│   Kubernetes Cluster    │
│  (Port 5173)    │    │   (Port 8080)   │    │                         │
└─────────────────┘    └─────────────────┘    │  ┌─────────────────┐    │
                              │               │  │ store-{id}      │    │
                              │ Helm          │  │ ┌─────────────┐ │    │
                              │ Install       │  │ │ Medusa API  │ │    │
                              ▼               │  │ │ + Admin     │ │    │
                       ┌──────────────┐       │  │ └─────────────┘ │    │
                       │ medusa-store │       │  │ ┌─────────────┐ │    │
                       │ Helm Chart   │───────│  │ │ PostgreSQL  │ │    │
                       └──────────────┘       │  │ └─────────────┘ │    │
                                              │  │ ┌─────────────┐ │    │
                                              │  │ │ Redis       │ │    │
                                              │  │ └─────────────┘ │    │
                                              │  │ ┌─────────────┐ │    │
                                              │  │ │ Storefront  │ │    │
                                              │  │ └─────────────┘ │    │
                                              │  └─────────────────┘    │
                                              └─────────────────────────┘
```

---

## 🚀 Quick Start (Local)

### Prerequisites

- Docker Desktop
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [Helm](https://helm.sh/docs/intro/install/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Go 1.21+ (for backend development)
- Node.js 18+ (for frontend development)

### 1. Clone & Setup

```bash
git clone https://github.com/0prashantyadav0/KubeStore.git
cd KubeStore

# Build Go backend
cd backend && go build ./... && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Create Kind Cluster

```bash
# Create cluster with ingress support
make kind-create

# Install NGINX Ingress Controller
make ingress-install
make ingress-wait
```

### 3. Build & Load Docker Images

```bash
# Build all images (platform, medusa, storefront)
make docker-build

# Load into Kind cluster
make kind-load
```

### 4. Start the Platform

```bash
# Terminal 1: Start Go backend
make run

# Terminal 2: Start frontend
cd frontend && npm run dev
```

### 5. Open Dashboard

Open http://localhost:5173 in your browser.

---

## 📦 Create a Store & Place an Order

### Via Dashboard

1. Click **"Create New Store"**
2. Enter a store name
3. Wait for status to change to **"Ready"**
4. Click the store URL to open the storefront
5. Add products to cart
6. Complete checkout (COD/test gateway)
7. Verify order in admin or API

**Notes**
- Each store runs a one-time **bootstrap Job** (Helm hook) that:
  - seeds demo products + shipping
  - creates an admin user (email/password stored in the store Secret)
  - creates a **publishable API key** and injects it into the store Secret for the Next.js storefront
- To retrieve the admin credentials for a store (local):

```bash
STORE_ID="<your_store_id>"
NS="store-${STORE_ID}"
SECRET="${STORE_ID}-medusa-store-secrets"

kubectl -n "${NS}" get secret "${SECRET}" -o jsonpath='{.data.ADMIN_EMAIL}' | base64 -d; echo
kubectl -n "${NS}" get secret "${SECRET}" -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d; echo
```

### Via API

```bash
# Create store
curl -X POST http://localhost:8080/api/stores \
  -H "Content-Type: application/json" \
  -d '{"name": "my-shop"}'

# List stores
curl http://localhost:8080/api/stores

# Get store details
curl http://localhost:8080/api/stores/{storeId}

# Delete store
curl -X DELETE http://localhost:8080/api/stores/{storeId}

# Upgrade store
curl -X POST http://localhost:8080/api/stores/{storeId}/upgrade \
  -H "Content-Type: application/json" \
  -d '{"values": {"medusa.replicas": "2"}}'

# Rollback store
curl -X POST http://localhost:8080/api/stores/{storeId}/rollback \
  -H "Content-Type: application/json" \
  -d '{"revision": 1}'

# Get store history
curl http://localhost:8080/api/stores/{storeId}/history

# Get store events
curl http://localhost:8080/api/stores/{storeId}/events

# Get platform metrics
curl http://localhost:8080/api/metrics

# Get audit log
curl http://localhost:8080/api/audit
```

---

## 🏭 Production Deployment (VPS / k3s)

### Prerequisites

- VPS with k3s installed
- Domain pointing to VPS IP
- (Optional) cert-manager for TLS

### 1. Install k3s

```bash
curl -sfL https://get.k3s.io | sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

### 2. Deploy with Production Values

```bash
# Copy production values and customize
cp charts/medusa-store/values-production.yaml values-prod.yaml

# Edit values-prod.yaml:
# - Set ingress.baseDomain to your domain
# - Enable TLS if using cert-manager

# Deploy a store manually (or via backend)
helm install my-store ./charts/medusa-store \
  -f values-prod.yaml \
  --namespace store-mystore \
  --create-namespace
```

### Deploy the Platform (Backend + Dashboard) with Helm (Recommended)

```bash
# Copy production values and customize
cp charts/kubestore-platform/values-production.yaml platform-prod.yaml

# Edit platform-prod.yaml:
# - Set ingress.host + ingress.baseDomain to your domain
# - Set stores.baseDomain to your stores wildcard domain (used for store URLs)
# - (Optional) adjust limits / resources / autoscaling

helm upgrade --install kubestore ./charts/kubestore-platform \
  -n kubestore-system \
  --create-namespace \
  -f platform-prod.yaml
```

### What Changes for Production

| Setting | Local | Production |
|---------|-------|------------|
| `ingress.baseDomain` | `127.0.0.1.nip.io` | `stores.yourdomain.com` |
| `ingress.tls.enabled` | `false` | `true` |
| `postgresql.storage.storageClass` | (default) | `local-path` |
| `medusa.image.pullPolicy` | `Never` | `IfNotPresent` |
| `medusa.replicas` | `1` | `2` |

### TLS with cert-manager

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

---

## 🔒 Security Features

### Network Policies
- **Deny-by-default** for all pods
- Explicit allows only for required traffic
- Store pods can only access their own database

### RBAC
- Per-store ServiceAccount
- Read-only access to pods/services
- No secrets access from pods

### Resource Limits
- `ResourceQuota` per namespace (10 pods, 10Gi storage)
- `LimitRange` for default pod resources
- Memory/CPU limits on all containers

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/stores` | Create new store |
| `GET` | `/api/stores` | List all stores |
| `GET` | `/api/stores/{id}` | Get store details |
| `DELETE` | `/api/stores/{id}` | Delete store |
| `POST` | `/api/stores/{id}/upgrade` | Upgrade store |
| `POST` | `/api/stores/{id}/rollback` | Rollback store |
| `GET` | `/api/stores/{id}/history` | Get Helm release history |
| `GET` | `/api/stores/{id}/events` | Get Kubernetes events |
| `GET` | `/api/metrics` | Platform metrics |
| `GET` | `/api/audit` | Audit log |

---

## 🛡️ Abuse Prevention

| Control | Value |
|---------|-------|
| Global rate limit | 100 requests / 15 min |
| Store creation limit | 3 stores / min / user |
| Max stores per user | 5 |
| Provisioning timeout | 5 minutes |

---

## 📁 Project Structure

```
KubeStore/
├── backend/                  # Go backend (API server)
│   ├── cmd/server/           # Main entry point
│   ├── internal/
│   │   ├── api/              # HTTP handlers & router
│   │   ├── helm/             # Helm client (install/upgrade/rollback)
│   │   ├── middleware/       # Rate limiting, audit logging
│   │   ├── models/           # Data models
│   │   ├── repository/       # Store persistence (BoltDB + in-memory)
│   │   └── services/         # Store service, metrics
│   ├── Dockerfile            # Production Docker image
│   └── go.mod
├── frontend/                 # React dashboard
│   ├── src/
│   │   ├── App.jsx           # Main component
│   │   └── api/              # API client
│   └── package.json
├── charts/
│   └── medusa-store/         # Helm chart for stores
│       ├── templates/
│       │   ├── medusa-deployment.yaml
│       │   ├── storefront-deployment.yaml
│       │   ├── postgresql-statefulset.yaml
│       │   ├── redis-deployment.yaml
│       │   ├── ingress.yaml
│       │   ├── networkpolicy.yaml
│       │   ├── rbac.yaml
│       │   ├── resourcequota.yaml
│       │   └── limitrange.yaml
│       ├── values.yaml           # Chart defaults
│       ├── values-local.yaml     # Local overrides (Kind)
│       └── values-production.yaml  # VPS values (k3s)
│   └── kubestore-platform/   # Helm chart for platform (backend + dashboard)
├── engines/                  # Store engines (pluggable)
│   └── medusa/
│       ├── medusa-starter-default/   # Medusa v2 backend (seeded)
│       └── nextjs-starter-medusa/    # Next.js v2 storefront
├── scripts/
│   └── kind-config.yaml      # Kind cluster config
├── Makefile                  # Build automation
├── SYSTEM_DESIGN.md          # Architecture doc
└── README.md                 # This file
```

---

## 🧪 Makefile Commands

```bash
# Development
make run              # Run Go backend locally
make build            # Build Go binary
make test             # Run tests

# Docker
make docker-build           # Build all images
make docker-build-platform  # Build Go backend image
make docker-build-dashboard # Build dashboard image
make docker-build-medusa    # Build Medusa image
make docker-build-storefront # Build storefront image

# Kind Cluster
make kind-create      # Create Kind cluster
make kind-delete      # Delete Kind cluster
make kind-load        # Load images into Kind

# Helm
make helm-lint        # Lint Helm chart
make helm-template    # Template Helm chart (dry run)

# Ingress
make ingress-install  # Install NGINX Ingress
make ingress-wait     # Wait for ingress to be ready
```

---

## 📋 Assessment Features Implemented

| Feature | Status | Location |
|---------|--------|----------|
| Multi-store provisioning | ✅ | `backend/internal/services/store_service.go` |
| Namespace isolation | ✅ | Helm chart creates per-store namespace |
| End-to-end orders | ✅ | MedusaJS storefront |
| VPS Deployment | ✅ | `values-production.yaml` |
| ResourceQuota/LimitRange | ✅ | `templates/resourcequota.yaml`, `limitrange.yaml` |
| Idempotency | ✅ | `store_service.go:provisionStore` |
| Rate Limiting | ✅ | `backend/internal/middleware/ratelimit.go` |
| Audit Logging | ✅ | `backend/internal/middleware/audit.go` |
| Observability (Metrics) | ✅ | `backend/internal/services/metrics.go` |
| Store Events | ✅ | `GET /api/stores/{id}/events` |
| RBAC | ✅ | `templates/rbac.yaml` |
| NetworkPolicy | ✅ | `templates/networkpolicy.yaml` |
| Upgrade/Rollback | ✅ | `backend/internal/helm/client.go` |
| Per-user quotas | ✅ | Max 5 stores per user |

---

## 📄 License

MIT License - This code is for assessment purposes.
