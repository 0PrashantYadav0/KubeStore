package repository

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kubestore/backend/internal/models"
)

func runRepositoryContract(t *testing.T, repo StoreRepository) {
	t.Helper()

	s := &models.Store{
		ID:     "s1234567",
		Name:   "My Shop",
		UserID: "1.2.3.4",
		Status: models.StatusProvisioning,
	}

	if err := repo.Create(s); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Idempotency lookup (user + name)
	got, err := repo.FindByUserAndName("1.2.3.4", "my shop")
	if err != nil {
		t.Fatalf("FindByUserAndName: %v", err)
	}
	if got.ID != s.ID {
		t.Fatalf("expected id %s, got %s", s.ID, got.ID)
	}

	if c := repo.Count(); c != 1 {
		t.Fatalf("expected Count=1, got %d", c)
	}
	if c := repo.CountByUser("1.2.3.4"); c != 1 {
		t.Fatalf("expected CountByUser=1, got %d", c)
	}

	// Update should preserve CreatedAt and set UpdatedAt
	s.Status = models.StatusReady
	s.URL = "http://store-s1234567.local"
	if err := repo.Update(s); err != nil {
		t.Fatalf("Update: %v", err)
	}

	got2, err := repo.Get(s.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got2.Status != models.StatusReady {
		t.Fatalf("expected status ready, got %s", got2.Status)
	}
	if got2.CreatedAt.IsZero() || got2.UpdatedAt.IsZero() {
		t.Fatalf("expected timestamps to be set")
	}
	if got2.CreatedAt.After(got2.UpdatedAt) {
		t.Fatalf("expected CreatedAt <= UpdatedAt")
	}

	if err := repo.Delete(s.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := repo.Get(s.ID); err == nil {
		t.Fatalf("expected Get to fail after delete")
	}
}

func TestInMemoryRepository_Contract(t *testing.T) {
	runRepositoryContract(t, NewInMemoryRepository())
}

func TestBoltRepository_Contract(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "kubestore.db")

	repo, err := NewBoltRepository(dbPath)
	if err != nil {
		t.Fatalf("NewBoltRepository: %v", err)
	}
	t.Cleanup(func() {
		_ = repo.Close()
		_ = os.RemoveAll(dir)
	})

	runRepositoryContract(t, repo)
}

