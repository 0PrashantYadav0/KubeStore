# Build output
FROM golang:1.23-alpine AS builder

WORKDIR /src

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files (from monorepo root context)
COPY backend/go.mod backend/go.sum ./backend/

WORKDIR /src/backend
RUN go mod download

# Copy source code
COPY backend/ ./

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /out/kubestore-backend ./cmd/server

# Final image
FROM alpine:3.19

WORKDIR /app

# Install required tools
RUN apk add --no-cache ca-certificates curl kubectl helm

# Copy binary from builder
COPY --from=builder /out/kubestore-backend .

# Bundle Helm charts into the image for in-cluster orchestration.
COPY charts/ /charts/

RUN addgroup -S kubestore && adduser -S -G kubestore -h /app kubestore \
  && chown -R kubestore:kubestore /app /charts

USER kubestore

EXPOSE 8080

ENTRYPOINT ["./kubestore-backend"]
