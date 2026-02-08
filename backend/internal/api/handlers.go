package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
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

// CreateStore handles POST /api/stores
func (h *Handler) CreateStore(w http.ResponseWriter, r *http.Request) {
	var req models.CreateStoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	store, err := h.storeService.CreateStore(req)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, models.ErrStoreNameRequired) ||
			errors.Is(err, models.ErrStoreNameTooShort) ||
			errors.Is(err, models.ErrStoreNameTooLong) {
			status = http.StatusBadRequest
		} else if errors.Is(err, models.ErrMaxStoresReached) {
			status = http.StatusForbidden
		}
		respondError(w, status, err.Error(), "")
		return
	}

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

	err := h.storeService.DeleteStore(id)
	if err != nil {
		if errors.Is(err, models.ErrStoreNotFound) {
			respondError(w, http.StatusNotFound, "store not found", "")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete store", err.Error())
		return
	}

	log.Printf("Store deletion initiated: %s", id)
	w.WriteHeader(http.StatusNoContent)
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
