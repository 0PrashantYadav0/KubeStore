package services

import (
	"bytes"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kubestore/backend/internal/helm"
	"github.com/kubestore/backend/internal/models"
	"github.com/kubestore/backend/internal/repository"
)

// Config holds service configuration
type Config struct {
	MaxStores     int
	IngressDomain string
	ChartPath     string
}

// StoreService handles store lifecycle management
type StoreService struct {
	repo       repository.StoreRepository
	helmClient *helm.Client
	config     Config
}

// NewStoreService creates a new store service
func NewStoreService(repo repository.StoreRepository, helmClient *helm.Client, config Config) *StoreService {
	return &StoreService{
		repo:       repo,
		helmClient: helmClient,
		config:     config,
	}
}

// CreateStore provisions a new store
func (s *StoreService) CreateStore(req models.CreateStoreRequest) (*models.Store, error) {
	// Validate request
	if err := req.Validate(); err != nil {
		return nil, err
	}

	// Check store limit
	if s.config.MaxStores > 0 && s.repo.Count() >= s.config.MaxStores {
		return nil, models.ErrMaxStoresReached
	}

	// Generate store ID (prefix with 's' + 7 chars to ensure starts with letter for K8s DNS-1035)
	storeID := "s" + strings.ToLower(uuid.New().String()[:7])
	namespace := fmt.Sprintf("store-%s", storeID)

	// Create store record
	store := &models.Store{
		ID:     storeID,
		Name:   req.Name,
		Status: models.StatusProvisioning,
	}

	if err := s.repo.Create(store); err != nil {
		return nil, err
	}

	// Provision asynchronously
	go s.provisionStore(store, namespace)

	return store, nil
}

// provisionStore runs the Helm install and updates status
func (s *StoreService) provisionStore(store *models.Store, namespace string) {
	log.Printf("Provisioning store %s in namespace %s", store.ID, namespace)

	opts := helm.InstallOptions{
		ReleaseName: store.ID,
		Namespace:   namespace,
		StoreID:     store.ID,
		StoreName:   store.Name,
	}

	err := s.helmClient.Install(opts)
	if err != nil {
		log.Printf("Failed to provision store %s: %v", store.ID, err)
		store.Status = models.StatusFailed
		store.FailReason = err.Error()
		s.repo.Update(store)
		return
	}

	// Update store with success
	store.Status = models.StatusReady
	store.URL = fmt.Sprintf("http://store-%s.%s", store.ID, s.config.IngressDomain)
	s.repo.Update(store)

	log.Printf("Store %s is ready at %s", store.ID, store.URL)
}

// GetStore retrieves a store by ID
func (s *StoreService) GetStore(id string) (*models.Store, error) {
	return s.repo.Get(id)
}

// ListStores retrieves all stores
func (s *StoreService) ListStores() (*models.StoreListResponse, error) {
	stores, err := s.repo.GetAll()
	if err != nil {
		return nil, err
	}

	return &models.StoreListResponse{
		Stores: stores,
		Count:  len(stores),
	}, nil
}

// DeleteStore removes a store
func (s *StoreService) DeleteStore(id string) error {
	store, err := s.repo.Get(id)
	if err != nil {
		return err
	}

	// Update status to deleting
	store.Status = models.StatusDeleting
	s.repo.Update(store)

	// Delete asynchronously
	go s.deprovisionStore(store)

	return nil
}

// deprovisionStore removes the Helm release and namespace
func (s *StoreService) deprovisionStore(store *models.Store) {
	namespace := fmt.Sprintf("store-%s", store.ID)

	log.Printf("Deprovisioning store %s from namespace %s", store.ID, namespace)

	// Uninstall Helm release
	err := s.helmClient.Uninstall(store.ID, namespace)
	if err != nil {
		log.Printf("Failed to uninstall Helm release for store %s: %v", store.ID, err)
		store.Status = models.StatusFailed
		store.FailReason = err.Error()
		s.repo.Update(store)
		return
	}

	// Delete namespace
	err = s.deleteNamespace(namespace)
	if err != nil {
		log.Printf("Failed to delete namespace %s: %v", namespace, err)
		// Continue with cleanup anyway
	}

	// Remove from repository
	s.repo.Delete(store.ID)

	log.Printf("Store %s deleted successfully", store.ID)
}

// deleteNamespace removes a Kubernetes namespace
func (s *StoreService) deleteNamespace(namespace string) error {
	cmd := exec.Command("kubectl", "delete", "namespace", namespace, "--ignore-not-found", "--wait=false")

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("kubectl delete namespace failed: %s, stderr: %s", err, stderr.String())
	}

	return nil
}

// WatchStoreStatus periodically checks store status (optional background worker)
func (s *StoreService) WatchStoreStatus(interval time.Duration, stopCh <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.checkStoreStatuses()
		case <-stopCh:
			return
		}
	}
}

// checkStoreStatuses updates status for provisioning stores
func (s *StoreService) checkStoreStatuses() {
	stores, _ := s.repo.GetAll()

	for _, store := range stores {
		if store.Status != models.StatusProvisioning {
			continue
		}

		namespace := fmt.Sprintf("store-%s", store.ID)
		status, err := s.helmClient.GetStatus(store.ID, namespace)
		if err != nil {
			continue
		}

		if status == nil {
			continue
		}

		updatedStore := store
		if status.Deployed {
			updatedStore.Status = models.StatusReady
			updatedStore.URL = fmt.Sprintf("http://store-%s.%s", store.ID, s.config.IngressDomain)
		} else if status.Failed {
			updatedStore.Status = models.StatusFailed
			updatedStore.FailReason = "Helm deployment failed"
		}

		if updatedStore.Status != store.Status {
			s.repo.Update(&updatedStore)
		}
	}
}
