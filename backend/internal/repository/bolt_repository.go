package repository

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/kubestore/backend/internal/models"
)

const (
	boltBucketStores    = "stores"
	boltBucketNameIndex = "name_index" // key: userID|lower(name) -> storeID
)

// BoltRepository persists stores in a local BoltDB file.
// This enables recovery after backend restarts (idempotency + reconcile).
type BoltRepository struct {
	db *bolt.DB
	mu sync.RWMutex
}

// NewBoltRepository opens/creates a BoltDB file at dbPath.
func NewBoltRepository(dbPath string) (*BoltRepository, error) {
	if dbPath == "" {
		return nil, fmt.Errorf("dbPath is required")
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}

	db, err := bolt.Open(dbPath, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open boltdb: %w", err)
	}

	// Ensure buckets exist
	if err := db.Update(func(tx *bolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists([]byte(boltBucketStores)); err != nil {
			return err
		}
		if _, err := tx.CreateBucketIfNotExists([]byte(boltBucketNameIndex)); err != nil {
			return err
		}
		return nil
	}); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("init boltdb: %w", err)
	}

	return &BoltRepository{db: db}, nil
}

// Close closes the underlying DB.
func (r *BoltRepository) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.db == nil {
		return nil
	}
	return r.db.Close()
}

func nameIndexKey(userID, name string) string {
	return userID + "|" + strings.ToLower(strings.TrimSpace(name))
}

func (r *BoltRepository) Create(store *models.Store) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.db.Update(func(tx *bolt.Tx) error {
		stores := tx.Bucket([]byte(boltBucketStores))
		idx := tx.Bucket([]byte(boltBucketNameIndex))

		if stores.Get([]byte(store.ID)) != nil {
			return models.ErrStoreExists
		}

		// Enforce idempotency by (userID,name) uniqueness
		if store.UserID != "" && store.Name != "" {
			if existingID := idx.Get([]byte(nameIndexKey(store.UserID, store.Name))); existingID != nil {
				return models.ErrStoreExists
			}
		}

		now := time.Now()
		store.CreatedAt = now
		store.UpdatedAt = now

		b, err := json.Marshal(store)
		if err != nil {
			return err
		}

		if err := stores.Put([]byte(store.ID), b); err != nil {
			return err
		}

		if store.UserID != "" && store.Name != "" {
			if err := idx.Put([]byte(nameIndexKey(store.UserID, store.Name)), []byte(store.ID)); err != nil {
				return err
			}
		}

		return nil
	})
}

func (r *BoltRepository) Get(id string) (*models.Store, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var store models.Store
	err := r.db.View(func(tx *bolt.Tx) error {
		stores := tx.Bucket([]byte(boltBucketStores))
		v := stores.Get([]byte(id))
		if v == nil {
			return models.ErrStoreNotFound
		}
		return json.Unmarshal(v, &store)
	})
	if err != nil {
		return nil, err
	}
	return &store, nil
}

func (r *BoltRepository) GetAll() ([]models.Store, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var storesOut []models.Store
	err := r.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(boltBucketStores))
		return b.ForEach(func(_, v []byte) error {
			var s models.Store
			if err := json.Unmarshal(v, &s); err != nil {
				return err
			}
			storesOut = append(storesOut, s)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	return storesOut, nil
}

func (r *BoltRepository) Update(store *models.Store) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.db.Update(func(tx *bolt.Tx) error {
		stores := tx.Bucket([]byte(boltBucketStores))
		idx := tx.Bucket([]byte(boltBucketNameIndex))

		existing := stores.Get([]byte(store.ID))
		if existing == nil {
			return models.ErrStoreNotFound
		}

		// Preserve CreatedAt from existing record if present
		var prev models.Store
		_ = json.Unmarshal(existing, &prev)
		if !prev.CreatedAt.IsZero() {
			store.CreatedAt = prev.CreatedAt
		}

		store.UpdatedAt = time.Now()

		b, err := json.Marshal(store)
		if err != nil {
			return err
		}

		if err := stores.Put([]byte(store.ID), b); err != nil {
			return err
		}

		// Keep name index in sync if (userID,name) changed.
		if prev.UserID != "" && prev.Name != "" {
			_ = idx.Delete([]byte(nameIndexKey(prev.UserID, prev.Name)))
		}
		if store.UserID != "" && store.Name != "" {
			if err := idx.Put([]byte(nameIndexKey(store.UserID, store.Name)), []byte(store.ID)); err != nil {
				return err
			}
		}

		return nil
	})
}

func (r *BoltRepository) Delete(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.db.Update(func(tx *bolt.Tx) error {
		stores := tx.Bucket([]byte(boltBucketStores))
		idx := tx.Bucket([]byte(boltBucketNameIndex))

		existing := stores.Get([]byte(id))
		if existing == nil {
			return models.ErrStoreNotFound
		}

		var prev models.Store
		_ = json.Unmarshal(existing, &prev)

		if err := stores.Delete([]byte(id)); err != nil {
			return err
		}

		if prev.UserID != "" && prev.Name != "" {
			_ = idx.Delete([]byte(nameIndexKey(prev.UserID, prev.Name)))
		}

		return nil
	})
}

func (r *BoltRepository) Count() int {
	stores, err := r.GetAll()
	if err != nil {
		return 0
	}
	return len(stores)
}

func (r *BoltRepository) CountByUser(userID string) int {
	stores, err := r.GetAll()
	if err != nil {
		return 0
	}
	count := 0
	for _, s := range stores {
		if s.UserID == userID {
			count++
		}
	}
	return count
}

func (r *BoltRepository) FindByUserAndName(userID, name string) (*models.Store, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var store models.Store
	err := r.db.View(func(tx *bolt.Tx) error {
		idx := tx.Bucket([]byte(boltBucketNameIndex))
		id := idx.Get([]byte(nameIndexKey(userID, name)))
		if id == nil {
			return models.ErrStoreNotFound
		}
		stores := tx.Bucket([]byte(boltBucketStores))
		v := stores.Get(id)
		if v == nil {
			return models.ErrStoreNotFound
		}
		return json.Unmarshal(v, &store)
	})
	if err != nil {
		return nil, err
	}
	return &store, nil
}

