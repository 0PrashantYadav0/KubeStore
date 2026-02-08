# Build output
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o kubestore-backend ./cmd/server

# Final image
FROM alpine:3.19

WORKDIR /app

# Install required tools
RUN apk add --no-cache ca-certificates curl kubectl helm

# Copy binary from builder
COPY --from=builder /app/kubestore-backend .

EXPOSE 8080

ENTRYPOINT ["./kubestore-backend"]
