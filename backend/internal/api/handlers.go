package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/kubestore/backend/internal/middleware"
	"github.com/kubestore/backend/internal/models"
	"github.com/kubestore/backend/internal/services"
)

// Handler handles HTTP requests
type Handler struct {
	storeService *services.StoreService
}

// NewHandler creates a new handler
func NewHandler(storeService *services.StoreService) *Handler {
	return &Handler{
		storeService: storeService,
	}
}

// getClientIP extracts client IP from request
func getClientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return forwarded
	}
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return realIP
	}
	return r.RemoteAddr
}

// CreateStore handles POST /api/stores
func (h *Handler) CreateStore(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	// Check store creation rate limit
	if !middleware.StoreCreationRateLimit(clientIP) {
		middleware.Audit.Log(middleware.ActionRateLimitHit, clientIP, "", "", "Store creation rate limit")
		respondError(w, http.StatusTooManyRequests, "Store creation rate limit exceeded. Max 3 per minute.", "")
		return
	}

	var req models.CreateStoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	store, err := h.storeService.CreateStore(req, clientIP)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, models.ErrStoreNameRequired) ||
			errors.Is(err, models.ErrStoreNameTooShort) ||
			errors.Is(err, models.ErrStoreNameTooLong) ||
			errors.Is(err, models.ErrInvalidEngine) ||
			errors.Is(err, models.ErrEngineNotImplemented) {
			status = http.StatusBadRequest
		} else if errors.Is(err, models.ErrMaxStoresReached) {
			middleware.Audit.Log(middleware.ActionQuotaExceeded, clientIP, "", req.Name, "Max stores quota")
			status = http.StatusForbidden
		}
		respondError(w, status, err.Error(), "")
		return
	}

	middleware.Audit.Log(middleware.ActionStoreCreated, clientIP, store.ID, store.Name, "")
	log.Printf("Store created: %s (%s)", store.Name, store.ID)
	respondJSON(w, http.StatusCreated, store)
}

// ListStores handles GET /api/stores
func (h *Handler) ListStores(w http.ResponseWriter, r *http.Request) {
	response, err := h.storeService.ListStores()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list stores", err.Error())
		return
	}

	// Update metrics
	services.PlatformMetrics.SetActiveStores(response.Count)

	respondJSON(w, http.StatusOK, response)
}

// GetStore handles GET /api/stores/{id}
func (h *Handler) GetStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "store id is required", "")
		return
	}

	store, err := h.storeService.GetStore(id)
	if err != nil {
		if errors.Is(err, models.ErrStoreNotFound) {
			respondError(w, http.StatusNotFound, "store not found", "")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to get store", err.Error())
		return
	}

	respondJSON(w, http.StatusOK, store)
}

// DeleteStore handles DELETE /api/stores/{id}
func (h *Handler) DeleteStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "store id is required", "")
		return
	}

	clientIP := getClientIP(r)
	store, _ := h.storeService.GetStore(id)
	storeName := ""
	if store != nil {
		storeName = store.Name
	}

	err := h.storeService.DeleteStore(id)
	if err != nil {
		if errors.Is(err, models.ErrStoreNotFound) {
			respondError(w, http.StatusNotFound, "store not found", "")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete store", err.Error())
		return
	}

	middleware.Audit.Log(middleware.ActionStoreDeleted, clientIP, id, storeName, "")
	log.Printf("Store deletion initiated: %s", id)
	w.WriteHeader(http.StatusNoContent)
}

// UpgradeStore handles POST /api/stores/{id}/upgrade
func (h *Handler) UpgradeStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "store id is required", "")
		return
	}

	var req models.UpgradeStoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	clientIP := getClientIP(r)

	err := h.storeService.UpgradeStore(id, req.Values)
	if err != nil {
		if errors.Is(err, models.ErrStoreNotFound) {
			respondError(w, http.StatusNotFound, "store not found", "")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to upgrade store", err.Error())
		return
	}

	middleware.Audit.Log(middleware.ActionStoreUpgraded, clientIP, id, "", fmt.Sprintf("values: %v", req.Values))
	respondJSON(w, http.StatusOK, map[string]string{"message": "upgrade initiated"})
}

// RollbackStore handles POST /api/stores/{id}/rollback
func (h *Handler) RollbackStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "store id is required", "")
		return
	}

	var req models.RollbackStoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	if req.Revision <= 0 {
		respondError(w, http.StatusBadRequest, "revision must be a positive integer", "")
		return
	}

	clientIP := getClientIP(r)

	err := h.storeService.RollbackStore(id, req.Revision)
	if err != nil {
		if errors.Is(err, models.ErrStoreNotFound) {
			respondError(w, http.StatusNotFound, "store not found", "")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to rollback store", err.Error())
		return
	}

	middleware.Audit.Log(middleware.ActionStoreRolledBack, clientIP, id, "", fmt.Sprintf("revision: %d", req.Revision))
	respondJSON(w, http.StatusOK, map[string]string{"message": "rollback initiated"})
}

// GetStoreHistory handles GET /api/stores/{id}/history
func (h *Handler) GetStoreHistory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "store id is required", "")
		return
	}

	history, err := h.storeService.GetStoreHistory(id)
	if err != nil {
		if errors.Is(err, models.ErrStoreNotFound) {
			respondError(w, http.StatusNotFound, "store not found", "")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to get store history", err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"history": history})
}

// GetStoreEvents handles GET /api/stores/{id}/events
func (h *Handler) GetStoreEvents(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "store id is required", "")
		return
	}

	events, err := h.storeService.GetStoreEvents(id)
	if err != nil {
		if errors.Is(err, models.ErrStoreNotFound) {
			respondError(w, http.StatusNotFound, "store not found", "")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to get store events", err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"events": events})
}

// GetMetrics handles GET /api/metrics
func (h *Handler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	metrics := services.PlatformMetrics.GetSnapshot()
	respondJSON(w, http.StatusOK, metrics)
}

// PromMetrics exposes Prometheus-style metrics at GET /metrics (text format).
func (h *Handler) PromMetrics(w http.ResponseWriter, r *http.Request) {
	m := services.PlatformMetrics.GetSnapshot()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")

	fmt.Fprintf(w, "# HELP kubestore_stores_created_total Total stores that reached READY.\n")
	fmt.Fprintf(w, "# TYPE kubestore_stores_created_total counter\n")
	fmt.Fprintf(w, "kubestore_stores_created_total %d\n", m.StoresCreated)

	fmt.Fprintf(w, "# HELP kubestore_stores_deleted_total Total stores deleted.\n")
	fmt.Fprintf(w, "# TYPE kubestore_stores_deleted_total counter\n")
	fmt.Fprintf(w, "kubestore_stores_deleted_total %d\n", m.StoresDeleted)

	fmt.Fprintf(w, "# HELP kubestore_provisioning_failures_total Total provisioning failures.\n")
	fmt.Fprintf(w, "# TYPE kubestore_provisioning_failures_total counter\n")
	fmt.Fprintf(w, "kubestore_provisioning_failures_total %d\n", m.ProvisioningFailures)

	fmt.Fprintf(w, "# HELP kubestore_avg_provisioning_time_ms Average provisioning time (ms).\n")
	fmt.Fprintf(w, "# TYPE kubestore_avg_provisioning_time_ms gauge\n")
	fmt.Fprintf(w, "kubestore_avg_provisioning_time_ms %d\n", m.AvgProvisioningTimeMs)

	fmt.Fprintf(w, "# HELP kubestore_active_stores Current active stores.\n")
	fmt.Fprintf(w, "# TYPE kubestore_active_stores gauge\n")
	fmt.Fprintf(w, "kubestore_active_stores %d\n", m.ActiveStores)
}

// GetAuditLog handles GET /api/audit
func (h *Handler) GetAuditLog(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	storeID := r.URL.Query().Get("storeId")

	entries := middleware.Audit.GetEntries(100, userID, storeID)
	respondJSON(w, http.StatusOK, map[string]interface{}{"entries": entries})
}

// Health handles GET /health
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

// respondJSON sends a JSON response
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

// respondError sends an error response
func respondError(w http.ResponseWriter, status int, errorMsg, message string) {
	response := models.ErrorResponse{
		Error:   errorMsg,
		Message: message,
	}
	respondJSON(w, status, response)
}
