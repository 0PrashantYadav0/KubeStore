package api

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	ratelimit "github.com/kubestore/backend/internal/middleware"
	"os"
	"strings"
)

// NewRouter creates a new HTTP router
func NewRouter(handler *Handler) *chi.Mux {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// Request metrics tracking middleware
	r.Use(ratelimit.RequestMetricsMiddleware)

	// Rate limiting middleware
	r.Use(ratelimit.RateLimitMiddleware)

	// CORS configuration
	allowedOrigins := []string{"http://localhost:*", "http://127.0.0.1:*"}
	if extra := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS")); extra != "" {
		for _, o := range strings.Split(extra, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				allowedOrigins = append(allowedOrigins, o)
			}
		}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check (not under /api)
	r.Get("/health", handler.Health)
	// Prometheus-style metrics (not under /api)
	r.Get("/metrics", handler.PromMetrics)

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Route("/stores", func(r chi.Router) {
			r.Post("/", handler.CreateStore)
			r.Get("/", handler.ListStores)
			r.Get("/{id}", handler.GetStore)
			r.Delete("/{id}", handler.DeleteStore)

			// Upgrade and rollback
			r.Post("/{id}/upgrade", handler.UpgradeStore)
			r.Post("/{id}/rollback", handler.RollbackStore)

			// Operations
			r.Post("/{id}/restart", handler.RestartStore)
			r.Get("/{id}/health", handler.CheckStoreHealth)
			r.Get("/{id}/pods", handler.GetStorePods)
			r.Get("/{id}/logs", handler.GetStoreLogs)

			// History and events
			r.Get("/{id}/history", handler.GetStoreHistory)
			r.Get("/{id}/events", handler.GetStoreEvents)
		})

		// Metrics and audit
		r.Get("/metrics", handler.GetMetrics)
		r.Get("/metrics/pods", handler.GetAggregatedPodMetrics)
		r.Get("/audit", handler.GetAuditLog)
	})

	return r
}
