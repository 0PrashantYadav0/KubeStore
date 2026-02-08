# KubeStore - Kubernetes Store Provisioning Platform

A Kubernetes-native platform for provisioning isolated e-commerce stores on demand using **Medusa.js** (Node.js) and **Helm**.

## 🏗️ Architecture

```
┌────────────────────────┐
│   React Dashboard      │  (Port 5173)
│   (User Interface)     │
└──────────┬─────────────┘
           │ HTTP
           ▼
┌────────────────────────┐
│   Golang Backend       │  (Port 8080)
│   (Store Manager API)  │
└──────────┬─────────────┘
           │ Helm CLI
           ▼
┌──────────────────────────────────────────┐
│   Kubernetes Cluster (Kind)              │
│  ┌────────────────────────────────────┐  │
│  │ Namespace: store-<id>              │  │
│  │  • Medusa Deployment               │  │
│  │  • PostgreSQL StatefulSet          │  │
│  │  • Redis Deployment                │  │
│  │  • Services / Ingress / Secrets    │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

## 📋 Prerequisites

| Tool | Version | Installation |
|------|---------|--------------|
| Go | 1.21+ | `brew install go` |
| Node.js | 18+ | `brew install node` |
| Docker | 24+ | [Docker Desktop](https://docker.com) |
| kubectl | 1.28+ | `brew install kubectl` |
| Helm | 3.12+ | `brew install helm` |
| Kind | 0.20+ | `brew install kind` |

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <repo-url>
cd KubeStore
```

### 2. Create Kind Cluster

```bash
# Create cluster with ingress support
make kind-create

# Verify cluster
kubectl cluster-info
kubectl get nodes
```

### 3. Install NGINX Ingress Controller

```bash
make ingress-install

# Wait for ingress to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

### 4. Run the Backend

```bash
# Install Go dependencies
make deps

# Run the backend server
make run
```

### 5. Run the Frontend

```bash
# In a new terminal
cd frontend
npm install
npm run dev
```

### 6. Access the Dashboard

Open http://localhost:5173 in your browser.

---

## 📖 All Commands

### Makefile Targets

```bash
# =====================
# Development
# =====================
make deps              # Install Go dependencies
make build             # Build backend binary
make run               # Run backend locally (port 8080)
make test              # Run all tests
make lint              # Run linter

# =====================
# Docker
# =====================
make docker-build      # Build backend Docker image
make docker-push       # Push to registry

# =====================
# Kind Cluster
# =====================
make kind-create       # Create Kind cluster
make kind-delete       # Delete Kind cluster
make kind-load         # Load Docker images into Kind

# =====================
# Ingress
# =====================
make ingress-install   # Install NGINX Ingress Controller
make ingress-wait      # Wait for ingress to be ready

# =====================
# Helm
# =====================
make helm-lint         # Lint Helm chart
make helm-template     # Render templates locally
make helm-install      # Install test store
make helm-uninstall    # Uninstall test store

# =====================
# Cleanup
# =====================
make clean             # Clean build artifacts
make clean-all         # Clean everything including Kind cluster
```

---

## 🔌 API Reference

### Base URL

```
http://localhost:8080/api
```

### Endpoints

#### Create Store

```bash
curl -X POST http://localhost:8080/api/stores \
  -H "Content-Type: application/json" \
  -d '{"name": "my-store"}'
```

**Response:**
```json
{
  "id": "abc123",
  "name": "my-store",
  "status": "provisioning",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### List Stores

```bash
curl http://localhost:8080/api/stores
```

**Response:**
```json
{
  "stores": [
    {
      "id": "abc123",
      "name": "my-store",
      "status": "ready",
      "url": "http://store-abc123.127.0.0.1.nip.io",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Store

```bash
curl http://localhost:8080/api/stores/{id}
```

#### Delete Store

```bash
curl -X DELETE http://localhost:8080/api/stores/{id}
```

#### Health Check

```bash
curl http://localhost:8080/health
```

---

## 🗂️ Project Structure

```
KubeStore/
├── README.md                    # This file
├── Makefile                     # Build automation
├── backend/                     # Golang backend
│   ├── cmd/server/main.go       # Entry point
│   ├── internal/
│   │   ├── api/                 # HTTP handlers
│   │   ├── models/              # Data structures
│   │   ├── repository/          # Data persistence
│   │   ├── services/            # Business logic
│   │   └── helm/                # Helm wrapper
│   ├── go.mod
│   └── Dockerfile
├── frontend/                    # React dashboard
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── charts/                      # Helm charts
│   └── medusa-store/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
└── scripts/                     # Utility scripts
    ├── setup-kind.sh
    └── kind-config.yaml
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Backend server port |
| `HELM_CHART_PATH` | `./charts/medusa-store` | Path to Helm chart |
| `INGRESS_DOMAIN` | `127.0.0.1.nip.io` | Base domain for stores |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

### Helm Values

Local development: `charts/medusa-store/values.yaml`
Production: `charts/medusa-store/values-production.yaml`

---

## 🔧 Troubleshooting

### Kind cluster issues

```bash
# Check cluster status
kind get clusters
docker ps

# Recreate cluster
make kind-delete
make kind-create
```

### Ingress not working

```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Check ingress resources
kubectl get ingress -A
```

### Store stuck in "provisioning"

```bash
# Check namespace
kubectl get all -n store-<id>

# Check events
kubectl get events -n store-<id> --sort-by='.lastTimestamp'

# Check pod logs
kubectl logs -n store-<id> -l app=medusa
```

### Helm release issues

```bash
# List releases
helm list -A

# Check release status
helm status <release-name> -n <namespace>

# Force uninstall
helm uninstall <release-name> -n <namespace> --no-hooks
kubectl delete namespace store-<id>
```

---

## 📝 License

MIT
