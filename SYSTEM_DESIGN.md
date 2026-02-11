# System Design & Tradeoffs

## Architecture Overview

KubeStore is a **store provisioning platform** that deploys MedusaJS e-commerce stores on Kubernetes. The same Helm charts work on local Kind clusters and production VPS (k3s).

```
┌─────────────────────────────────────────────────────────────────┐
│                      KubeStore Platform                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐        ┌─────────────────────────────────┐ │
│  │   React         │        │     Go Backend                  │ │
│  │   Dashboard     │◀──────▶│     (chi)                       │ │
│  │   (Vite)        │  REST  │                                 │ │
│  └─────────────────┘   API  │  ┌───────────────────────────┐  │ │
│                             │  │  Rate Limiting            │  │ │
│                             │  │  - 100 req/15min global   │  │ │
│                             │  │  - 3 stores/min per user  │  │ │
│                             │  │  - 5 stores max per user  │  │ │
│                             │  └───────────────────────────┘  │ │
│                             │                                 │ │
│                             │  ┌───────────────────────────┐  │ │
│                             │  │  Audit Logging            │  │ │
│                             │  │  - All CRUD operations    │  │ │
│                             │  │  - Security events        │  │ │
│                             │  └───────────────────────────┘  │ │
│                             │                                 │ │
│                             │  ┌───────────────────────────┐  │ │
│                             │  │  Helm Client              │  │ │
│                             │  │  - Install/Uninstall      │  │ │
│                             │  │  - Upgrade/Rollback       │  │ │
│                             │  └───────────────────────────┘  │ │
│                             └─────────────────────────────────┘ │
│                                           │                     │
│                                           ▼                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Kubernetes Cluster (Kind / k3s)               │ │
│  │                                                            │ │
│  │   ┌─────────────────────────────────────────────────────┐  │ │
│  │   │ Namespace: store-{id}                               │  │ │
│  │   │                                                     │  │ │
│  │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │ │
│  │   │  │ MedusaJS    │  │ PostgreSQL  │  │ Redis       │  │  │ │
│  │   │  │ Deployment  │  │ StatefulSet │  │ Deployment  │  │  │ │
│  │   │  │ (non-root)  │  │ + PVC       │  │             │  │  │ │
│  │   │  └─────────────┘  └─────────────┘  └─────────────┘  │  │ │
│  │   │                                                     │  │ │
│  │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │ │
│  │   │  │ ResourceQ   │  │ LimitRange  │  │ NetworkPol  │  │  │ │
│  │   │  │ 10 pods max │  │ Defaults    │  │ Deny-by-def │  │  │ │
│  │   │  └─────────────┘  └─────────────┘  └─────────────┘  │  │ │
│  │   │                                                     │  │ │
│  │   │  ┌─────────────┐  ┌─────────────┐                   │  │ │
│  │   │  │ RBAC        │  │ Secrets     │                   │  │ │
│  │   │  │ ServiceAcct │  │ DB creds    │                   │  │ │
│  │   │  └─────────────┘  └─────────────┘                   │  │ │
│  │   └─────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │   Ingress: store-{id}.127.0.0.1.nip.io                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **React Dashboard** | User interface for managing stores |
| **Go Backend** | REST API, orchestration, rate limiting |
| **Helm Client** | Kubernetes deployments via Helm charts |
| **Kube Client** | Direct kubectl operations (namespaces, events) |
| **MedusaJS** | E-commerce backend per store |
| **PostgreSQL** | Persistent database per store |
| **Redis** | Cache and sessions per store |

---

## End-to-End Flow

### Store Creation
```
1. User clicks "Create New Store" in Dashboard
2. POST /api/stores → Backend validates & rate limits
3. Backend generates store ID and creates store record (PROVISIONING)
4. Async: Helm install creates namespace + resources
5. Async: Wait for Kubernetes endpoints to be ready
6. Async: Run 10 consecutive health checks
7. Async: Wait 5s stability delay
8. Store marked READY with URL
```

### Store Deletion
```
1. User clicks "Delete" in Dashboard
2. DELETE /api/stores/:id → Backend validates
3. Helm uninstall removes release
4. kubectl delete namespace removes all resources
5. Store removed from records
```

---

## Isolation & Multi-Tenancy

### Namespace Isolation
- Each store runs in its own namespace: `store-{id}`
- ResourceQuota limits per namespace (10 pods, 10Gi storage)
- LimitRange sets default resource requests/limits

### Network Isolation
- **NetworkPolicy: Deny-by-default** for all pods
- Explicit allows only for required traffic:
  - Ingress → Medusa (port 9000)
  - Medusa → PostgreSQL (port 5432)
  - Medusa → Redis (port 6379)
  - All pods → DNS

### Resource Isolation
| Resource | Limit per Store |
|----------|-----------------|
| Pods | 10 |
| Services | 5 |
| PVCs | 3 |
| Storage | 10Gi |
| CPU (requests) | 2 cores |
| Memory (requests) | 2Gi |

---

## Idempotency & Failure Handling

### Idempotent Store Creation
- The backend enforces **idempotency per user + store name**:
  - If the same user retries `POST /api/stores` with the same `name`, the backend returns the existing store instead of creating duplicates.
- Helm operations are **serialized per store** (install/upgrade/rollback/delete don’t overlap).
- Provisioning concurrency is bounded with a **worker semaphore** to protect the cluster from spikes.

### Recovery on Restart
- Store state is persisted in a **local BoltDB** file (`STORE_DB_PATH`) so a backend restart doesn’t lose store records.
- A reconciliation loop periodically checks Kubernetes/Helm state for provisioning stores and marks them Ready/Failed accordingly.

### Health Check Robustness
- Requires **10 consecutive** successful health checks
- 2-second intervals between checks
- 5-second stability delay after passing
- 120-second timeout total

---

## Security Posture

### Secret Handling
- All secrets in Kubernetes Secrets (not in source code)
- Database and JWT/Cookie secrets are **generated per store** and **kept stable across Helm upgrades** using Helm `lookup` on the existing Secret.
- A one-time **bootstrap Job** creates a **publishable API key** token and patches it into the Secret so the Next.js storefront can call `/store` APIs.
- Secrets are mounted as environment variables

### RBAC / Least Privilege
- Each store has its own ServiceAccount
- Role allows only: pods, services, configmaps (read-only)
- No cluster-wide permissions

### What's Exposed Publicly
- **Public**: Ingress (store URLs)
- **Internal**: PostgreSQL, Redis (no external access)
- **Backend**: Rate-limited, input-validated

### Container Hardening
- Non-root user where possible
- Read-only root filesystem (where applicable)
- Resource limits prevent resource exhaustion

---

## Horizontal Scaling Plan

### What Scales Horizontally
| Component | Scaling Approach |
|-----------|------------------|
| Dashboard | Static files, CDN-compatible |
| Backend | Horizontally scalable after swapping BoltDB for an external DB + leader election; platform chart includes optional HPA. Default deployment uses 1 replica with BoltDB. |
| Medusa | Per-store, independent scaling |

### Provisioning Throughput
- Rate limiter: 3 stores/minute/user
- Concurrent provisioning via bounded worker pool (configurable `PROVISION_WORKERS`)
- Helm operations serialized per store

### Stateful Constraints
- PostgreSQL: StatefulSet with PVC (vertical scaling only)
- Redis: Single replica (can be Redis Cluster)
- Demo data + publishable key bootstrapping: one-time Helm hook Job per store

---

## Abuse Prevention

### Rate Limiting
| Limit | Value |
|-------|-------|
| Global requests | 100/15 min |
| Store creation | 3/min/user |
| Max stores per user | 5 |

### Blast Radius Controls
- Namespace isolation limits impact
- ResourceQuota prevents resource exhaustion
- Provisioning timeout (5 minutes max)

### Audit Trail
```json
{
  "action": "STORE_CREATED",
  "userId": "192.168.1.100",
  "storeId": "s1234567",
  "storeName": "my-shop",
  "timestamp": "2026-02-09T12:00:00.000Z"
}
```

---

## Local vs Production (Helm Values)

| Setting | Local (Kind) | Production (k3s/VPS) |
|---------|--------------|----------------------|
| Ingress domain | `127.0.0.1.nip.io` | `yourdomain.com` |
| TLS | Disabled | `cert-manager` |
| Storage class | (default) | `local-path` |
| Image pull policy | `Never` | `IfNotPresent` |
| Replicas | 1 | 2+ |
| Resources | Minimal | Production-sized |
| Secrets | Helm values | External secrets |

### Production Deployment
```bash
# Deploy to k3s VPS
helm install my-store ./charts/medusa-store \
  -f charts/medusa-store/values-production.yaml \
  --set ingress.baseDomain=stores.mydomain.com \
  --set postgresql.password=$(openssl rand -base64 32)
```

---

## Upgrade & Rollback

### Upgrade a Store
```bash
# Via API
POST /api/stores/:id/upgrade
{ "valuesFile": "values-v2.yaml" }

# Via Helm directly
helm upgrade store-id ./charts/medusa-store \
  --namespace store-{id} \
  --set medusa.image.tag=v2.0.0
```

### Rollback a Store
```bash
# Via API
POST /api/stores/:id/rollback
{ "revision": 1 }

# Via Helm directly
helm rollback store-id 1 --namespace store-{id}
```

### Release History
```bash
GET /api/stores/:id/history
helm history store-id --namespace store-{id}
```

---

## Tradeoffs & Design Decisions

### 1. Namespace per Store
**Choice**: Each store gets its own namespace
**Tradeoff**: More namespaces to manage, but better isolation
**Reason**: Clean teardown, security boundaries, resource quotas

### 2. Persistent Store State (BoltDB)
**Choice**: Store records persisted in a local BoltDB file (`STORE_DB_PATH`)
**Tradeoff**: Single-writer file (default deployment uses 1 backend replica)
**Reason**: Enables restart recovery + idempotency without needing external infra for Round 1

### 3. Helm for Orchestration
**Choice**: Helm charts over raw manifests
**Tradeoff**: Helm dependency, learning curve
**Reason**: Required by assessment, better templating, rollback support

### 4. Health Check Count (10)
**Choice**: Require 10 consecutive successful checks
**Tradeoff**: Longer provisioning time
**Reason**: Eliminates intermittent 503 errors from ingress sync

### 5. NetworkPolicy Deny-by-Default
**Choice**: Block all traffic, allow explicitly
**Tradeoff**: More configuration required
**Reason**: Better security posture, explicit traffic flows
