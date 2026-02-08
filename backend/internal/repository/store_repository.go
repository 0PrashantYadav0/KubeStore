package repository

import (
	"sync"
	"time"

	"github.com/kubestore/backend/internal/models"
)

// StoreRepository defines the interface for store persistence
type StoreRepository interface {
	Create(store *models.Store) error
	Get(id string) (*models.Store, error)
	GetAll() ([]models.Store, error)
	Update(store *models.Store) error
	Delete(id string) error
	Count() int
}

// InMemoryRepository implements StoreRepository using in-memory storage
type InMemoryRepository struct {
	stores map[string]*models.Store
	mu     sync.RWMutex
}

// NewInMemoryRepository creates a new in-memory repository
func NewInMemoryRepository() *InMemoryRepository {
	return &InMemoryRepository{
		stores: make(map[string]*models.Store),
	}
}

// Create adds a new store to the repository
func (r *InMemoryRepository) Create(store *models.Store) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.stores[store.ID]; exists {
		return models.ErrStoreExists
	}

	store.CreatedAt = time.Now()
	store.UpdatedAt = time.Now()
	r.stores[store.ID] = store
	return nil
}

// Get retrieves a store by ID
func (r *InMemoryRepository) Get(id string) (*models.Store, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	store, exists := r.stores[id]
	if !exists {
		return nil, models.ErrStoreNotFound
	}
	return store, nil
}

// GetAll retrieves all stores
func (r *InMemoryRepository) GetAll() ([]models.Store, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	stores := make([]models.Store, 0, len(r.stores))
	for _, store := range r.stores {
		stores = append(stores, *store)
	}
	return stores, nil
}

// Update updates an existing store
func (r *InMemoryRepository) Update(store *models.Store) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.stores[store.ID]; !exists {
		return models.ErrStoreNotFound
	}

	store.UpdatedAt = time.Now()
	r.stores[store.ID] = store
	return nil
}

// Delete removes a store from the repository
func (r *InMemoryRepository) Delete(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.stores[id]; !exists {
		return models.ErrStoreNotFound
	}

	delete(r.stores, id)
	return nil
}

// Count returns the number of stores
func (r *InMemoryRepository) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.stores)
}
