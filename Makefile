# Variables
BINARY_NAME=kubestore-backend
DOCKER_IMAGE=kubestore-backend
DOCKER_TAG=latest
KIND_CLUSTER_NAME=kubestore
HELM_RELEASE_NAME=test-store
HELM_CHART_PATH=./charts/medusa-store
NAMESPACE=test-store

# Go variables
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod

# Build directories
BUILD_DIR=./build
BACKEND_DIR=./backend

.PHONY: all build clean test run deps docker-build docker-push \
        kind-create kind-delete kind-load \
        ingress-install ingress-wait \
        helm-lint helm-template helm-install helm-uninstall \
        frontend-install frontend-dev clean-all

# =====================
# Default target
# =====================
all: build

# =====================
# Development
# =====================

## deps: Install Go dependencies
deps:
	@echo "📦 Installing Go dependencies..."
	cd $(BACKEND_DIR) && $(GOMOD) download
	cd $(BACKEND_DIR) && $(GOMOD) tidy

## build: Build the backend binary
build:
	@echo "🔨 Building backend..."
	@mkdir -p $(BUILD_DIR)
	cd $(BACKEND_DIR) && $(GOBUILD) -o ../$(BUILD_DIR)/$(BINARY_NAME) ./cmd/server

## run: Run the Go backend server
run:
	@echo "🚀 Starting Go backend server..."
	cd $(BACKEND_DIR) && HELM_VALUES_FILE=../charts/medusa-store/values-local.yaml STORE_DB_PATH=../data/kubestore.db go run ./cmd/server

## run-dev: Run Go backend with auto-reload (requires air)
run-dev:
	@echo "🚀 Starting Go backend (dev mode)..."
	cd $(BACKEND_DIR) && go run ./cmd/server

## run-binary: Run the compiled Go binary
run-binary:
	@echo "🚀 Starting Go backend server..."
	cd $(BACKEND_DIR) && $(GOCMD) run ./cmd/server

## test: Run all tests
test:
	@echo "🧪 Running tests..."
	cd $(BACKEND_DIR) && $(GOTEST) -v ./...

## lint: Run linter
lint:
	@echo "🔍 Running linter..."
	cd $(BACKEND_DIR) && golangci-lint run ./...

## clean: Clean build artifacts
clean:
	@echo "🧹 Cleaning..."
	@rm -rf $(BUILD_DIR)
	cd $(BACKEND_DIR) && $(GOCLEAN)

# =====================
# Docker
# =====================

## docker-build: Build platform images only (backend + dashboard)
docker-build: docker-build-platform docker-build-dashboard
	@echo "✅ Platform images built!"

## docker-build-all: Build platform + all engine images
docker-build-all: docker-build-platform docker-build-dashboard docker-build-medusa docker-build-storefront
	@echo "✅ Platform + engine images built! (WooCommerce uses official Docker Hub images)"

## docker-build-platform: Build platform Go backend Docker image
docker-build-platform:
	@echo "🐳 Building platform backend image..."
	docker build -t kubestore-backend:latest -f ./backend/Dockerfile .

## docker-build-dashboard: Build React dashboard image (nginx)
docker-build-dashboard:
	@echo "🐳 Building dashboard image..."
	docker build -t kubestore-dashboard:latest -f ./frontend/Dockerfile ./frontend

## docker-build-medusa: Build MedusaJS backend Docker image
docker-build-medusa:
	@echo "🐳 Building MedusaJS backend image..."
	docker build -t kubestore-medusa:latest -f ./engines/medusa/medusa-starter-default/Dockerfile ./engines/medusa/medusa-starter-default

## docker-build-storefront: Build Next.js storefront Docker image
docker-build-storefront:
	@echo "🐳 Building Next.js storefront image..."
	docker build -t kubestore-storefront:latest -f ./engines/medusa/nextjs-starter-medusa/Dockerfile ./engines/medusa/nextjs-starter-medusa

## docker-build-legacy: Build old backend Docker image
docker-build-legacy:
	@echo "🐳 Building Docker image..."
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) -f $(BACKEND_DIR)/Dockerfile $(BACKEND_DIR)

## docker-push: Push Docker image
docker-push:
	@echo "📤 Pushing Docker image..."
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)

# =====================
# Kind Cluster
# =====================

## kind-create: Create Kind cluster with ingress support
kind-create:
	@echo "☸️  Creating Kind cluster..."
	@if kind get clusters | grep -q "^$(KIND_CLUSTER_NAME)$$"; then \
		echo "✅ Cluster '$(KIND_CLUSTER_NAME)' already exists, skipping creation"; \
	else \
		kind create cluster --name $(KIND_CLUSTER_NAME) --config ./scripts/kind-config.yaml; \
		echo "✅ Kind cluster created!"; \
	fi
	kubectl cluster-info --context kind-$(KIND_CLUSTER_NAME)

## kind-delete: Delete Kind cluster
kind-delete:
	@echo "🗑️  Deleting Kind cluster..."
	kind delete cluster --name $(KIND_CLUSTER_NAME)

## kind-load: Load Docker images into Kind
kind-load:
	@echo "📥 Loading images into Kind..."
	kind load docker-image kubestore-backend:latest --name $(KIND_CLUSTER_NAME)
	kind load docker-image kubestore-medusa:latest --name $(KIND_CLUSTER_NAME)
	kind load docker-image kubestore-storefront:latest --name $(KIND_CLUSTER_NAME)
	kind load docker-image kubestore-dashboard:latest --name $(KIND_CLUSTER_NAME)
	@echo "✅ All images loaded!"

# =====================
# Ingress
# =====================

## ingress-install: Install NGINX Ingress Controller
ingress-install:
	@echo "🌐 Installing NGINX Ingress Controller..."
	kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

## ingress-wait: Wait for ingress controller to be ready
ingress-wait:
	@echo "⏳ Waiting for ingress controller pods to start (10s)..."
	@sleep 10
	kubectl wait --namespace ingress-nginx \
		--for=condition=ready pod \
		--selector=app.kubernetes.io/component=controller \
		--timeout=120s
	@echo "✅ Ingress controller ready!"

# =====================
# Helm
# =====================

## helm-lint: Lint all Helm charts
helm-lint:
	@echo "🔍 Linting Helm charts..."
	helm lint $(HELM_CHART_PATH)
	helm lint ./charts/woocommerce-store

## helm-template: Render Helm templates locally
helm-template:
	@echo "📄 Rendering Helm templates..."
	helm template $(HELM_RELEASE_NAME) $(HELM_CHART_PATH) --namespace $(NAMESPACE)

## helm-install: Install test store
helm-install:
	@echo "📦 Installing test store..."
	helm install $(HELM_RELEASE_NAME) $(HELM_CHART_PATH) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--wait \
		--timeout 5m

## helm-uninstall: Uninstall test store
helm-uninstall:
	@echo "🗑️  Uninstalling test store..."
	helm uninstall $(HELM_RELEASE_NAME) --namespace $(NAMESPACE) || true
	kubectl delete namespace $(NAMESPACE) --ignore-not-found

## helm-upgrade: Upgrade test store
helm-upgrade:
	@echo "⬆️  Upgrading test store..."
	helm upgrade $(HELM_RELEASE_NAME) $(HELM_CHART_PATH) \
		--namespace $(NAMESPACE) \
		--wait \
		--timeout 5m

# =====================
# Frontend
# =====================

## frontend-install: Install frontend dependencies
frontend-install:
	@echo "📦 Installing frontend dependencies..."
	cd frontend && npm install

## frontend-dev: Run frontend dev server
frontend-dev:
	@echo "🎨 Starting frontend..."
	cd frontend && npm run dev

## frontend-build: Build frontend for production
frontend-build:
	@echo "🏗️  Building frontend..."
	cd frontend && npm run build

# =====================
# Full cleanup
# =====================

## clean-all: Clean everything including Kind cluster
clean-all: clean kind-delete
	@echo "🧹 Full cleanup complete!"

# =====================
# Help
# =====================

## help: Show this help
help:
	@echo "KubeStore - Kubernetes Store Provisioning Platform"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@sed -n 's/^##//p' $(MAKEFILE_LIST) | column -t -s ':' | sed -e 's/^/ /'
