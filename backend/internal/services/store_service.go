package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kubestore/backend/internal/helm"
	"github.com/kubestore/backend/internal/middleware"
	"github.com/kubestore/backend/internal/models"
	"github.com/kubestore/backend/internal/repository"
)

// Config holds service configuration
type Config struct {
	MaxStoresTotal   int
	MaxStoresPerUser int
	ProvisionWorkers int // max concurrent provisioning operations
	IngressDomain    string
	ChartPath        string
}

// StoreService handles store lifecycle management
type StoreService struct {
	repo       repository.StoreRepository
	helmClient *helm.Client
	config     Config

	provisionSem chan struct{}
	locksMu      sync.Mutex
	storeLocks   map[string]*sync.Mutex
}

// NewStoreService creates a new store service
func NewStoreService(repo repository.StoreRepository, helmClient *helm.Client, config Config) *StoreService {
	workers := config.ProvisionWorkers
	if workers <= 0 {
		workers = 3
	}
	return &StoreService{
		repo:         repo,
		helmClient:   helmClient,
		config:       config,
		provisionSem: make(chan struct{}, workers),
		storeLocks:   make(map[string]*sync.Mutex),
	}
}

// CreateStore provisions a new store
func (s *StoreService) CreateStore(req models.CreateStoreRequest, userID string) (*models.Store, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}

	engine := req.Engine
	if engine == "" {
		engine = "medusa"
	}
	if engine == "woocommerce" {
		return nil, models.ErrEngineNotImplemented
	}

	// Idempotency: if user retries with same name, return existing store.
	if userID != "" {
		if existing, err := s.repo.FindByUserAndName(userID, req.Name); err == nil && existing != nil {
			return existing, nil
		}
	}

	// Blast-radius controls
	if s.config.MaxStoresTotal > 0 && s.repo.Count() >= s.config.MaxStoresTotal {
		return nil, models.ErrMaxStoresReached
	}
	if s.config.MaxStoresPerUser > 0 && userID != "" && s.repo.CountByUser(userID) >= s.config.MaxStoresPerUser {
		return nil, models.ErrMaxStoresReached
	}

	storeID := "s" + strings.ToLower(uuid.New().String()[:7])
	namespace := fmt.Sprintf("store-%s", storeID)

	store := &models.Store{
		ID:        storeID,
		Name:      req.Name,
		Engine:    engine,
		UserID:    userID,
		Namespace: namespace,
		Status:    models.StatusProvisioning,
	}

	if err := s.repo.Create(store); err != nil {
		return nil, err
	}

	go s.provisionStore(store)

	return store, nil
}

// ---------------------------------------------------------------------------
// Provisioning pipeline
// ---------------------------------------------------------------------------

func (s *StoreService) provisionStore(store *models.Store) {
	s.provisionSem <- struct{}{}
	defer func() { <-s.provisionSem }()

	lock := s.getStoreLock(store.ID)
	lock.Lock()
	defer lock.Unlock()

	start := time.Now()
	namespace := store.Namespace
	storeURL := fmt.Sprintf("http://store-%s.%s", store.ID, s.config.IngressDomain)
	healthURL := storeURL + "/health"

	log.Printf("[provision] %s: helm install in %s", store.ID, namespace)

	opts := helm.InstallOptions{
		ReleaseName: store.ID,
		Namespace:   namespace,
		StoreID:     store.ID,
		StoreName:   store.Name,
	}

	if err := s.helmClient.Install(opts); err != nil {
		s.failStore(store, err.Error())
		return
	}

	log.Printf("[provision] %s: waiting for health at %s", store.ID, healthURL)
	if err := s.waitForHealth(healthURL, 10*time.Minute); err != nil {
		s.failStore(store, "Health timeout: "+err.Error())
		return
	}

	log.Printf("[provision] %s: bootstrapping (publishable key)", store.ID)
	if err := s.bootstrapStore(storeURL, namespace, store.ID); err != nil {
		log.Printf("[provision] %s: bootstrap warning (non-fatal): %v", store.ID, err)
		// Non-fatal: store is usable for admin, just storefront key may be missing
	}

	store.Status = models.StatusReady
	store.URL = storeURL
	store.AdminURL = storeURL + "/app"
	s.repo.Update(store)

	PlatformMetrics.RecordStoreCreated(time.Since(start).Milliseconds())
	middleware.Audit.Log(middleware.ActionStoreCreated, store.UserID, store.ID, store.Name, "")
	log.Printf("[provision] %s: ready at %s (took %s)", store.ID, store.URL, time.Since(start).Round(time.Second))
}

// waitForHealth polls the Medusa /health endpoint until 3 consecutive 200s.
func (s *StoreService) waitForHealth(url string, timeout time.Duration) error {
	client := &http.Client{Timeout: 5 * time.Second}
	deadline := time.Now().Add(timeout)
	consecutive := 0

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				consecutive++
				if consecutive >= 3 {
					return nil
				}
			} else {
				consecutive = 0
			}
		} else {
			consecutive = 0
		}
		time.Sleep(5 * time.Second)
	}

	return fmt.Errorf("health at %s not ready within %v", url, timeout)
}

// bootstrapStore creates the publishable API key via Medusa Admin API,
// patches the K8s secret, and restarts the storefront so it picks up the key.
func (s *StoreService) bootstrapStore(storeURL, namespace, storeID string) error {
	secretName := fmt.Sprintf("%s-medusa-store-secrets", storeID)

	email := s.readSecretKey(namespace, secretName, "ADMIN_EMAIL")
	password := s.readSecretKey(namespace, secretName, "ADMIN_PASSWORD")
	if email == "" || password == "" {
		return fmt.Errorf("could not read admin credentials from secret")
	}

	// Login
	token, err := s.medusaLogin(storeURL, email, password)
	if err != nil {
		return fmt.Errorf("medusa login: %w", err)
	}

	// Get or create publishable API key
	keyToken, keyID, err := s.ensurePublishableKey(storeURL, token)
	if err != nil {
		return fmt.Errorf("publishable key: %w", err)
	}

	// Link key to default sales channel (best effort)
	s.linkSalesChannel(storeURL, token, keyID)

	// Patch the K8s secret
	if err := s.patchSecret(namespace, secretName, "PUBLISHABLE_API_KEY", keyToken); err != nil {
		return fmt.Errorf("patch secret: %w", err)
	}

	// Restart storefront so it reads the updated secret
	deploy := fmt.Sprintf("%s-storefront", storeID)
	s.restartDeployment(namespace, deploy)

	log.Printf("[bootstrap] %s: publishable key stored, storefront restarting", storeID)
	return nil
}

// ---------------------------------------------------------------------------
// Medusa Admin API helpers
// ---------------------------------------------------------------------------

func (s *StoreService) medusaLogin(storeURL, email, password string) (string, error) {
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := http.Post(storeURL+"/auth/user/emailpass", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || result.Token == "" {
		return "", fmt.Errorf("login returned status %d, no token", resp.StatusCode)
	}
	return result.Token, nil
}

func (s *StoreService) ensurePublishableKey(storeURL, jwt string) (keyToken, keyID string, err error) {
	// List existing keys
	req, _ := http.NewRequest("GET", storeURL+"/admin/api-keys?type=publishable", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var listResult struct {
		APIKeys []struct {
			ID    string `json:"id"`
			Token string `json:"token"`
		} `json:"api_keys"`
	}
	json.NewDecoder(resp.Body).Decode(&listResult)
	for _, k := range listResult.APIKeys {
		if k.Token != "" {
			return k.Token, k.ID, nil
		}
	}

	// Create new key
	createBody, _ := json.Marshal(map[string]string{"title": "Storefront Key", "type": "publishable"})
	req2, _ := http.NewRequest("POST", storeURL+"/admin/api-keys", bytes.NewReader(createBody))
	req2.Header.Set("Authorization", "Bearer "+jwt)
	req2.Header.Set("Content-Type", "application/json")
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		return "", "", err
	}
	defer resp2.Body.Close()

	respBytes, _ := io.ReadAll(resp2.Body)
	var createResult struct {
		APIKey struct {
			ID    string `json:"id"`
			Token string `json:"token"`
		} `json:"api_key"`
	}
	if err := json.Unmarshal(respBytes, &createResult); err != nil || createResult.APIKey.Token == "" {
		return "", "", fmt.Errorf("create api-key failed: status %d body %s", resp2.StatusCode, string(respBytes))
	}
	return createResult.APIKey.Token, createResult.APIKey.ID, nil
}

func (s *StoreService) linkSalesChannel(storeURL, jwt, apiKeyID string) {
	// Get default sales channel
	req, _ := http.NewRequest("GET", storeURL+"/admin/sales-channels", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var scResult struct {
		SalesChannels []struct {
			ID string `json:"id"`
		} `json:"sales_channels"`
	}
	json.NewDecoder(resp.Body).Decode(&scResult)
	if len(scResult.SalesChannels) == 0 {
		return
	}

	scID := scResult.SalesChannels[0].ID
	linkBody, _ := json.Marshal(map[string]interface{}{"add": []string{scID}})
	req2, _ := http.NewRequest("POST", fmt.Sprintf("%s/admin/api-keys/%s/sales-channels", storeURL, apiKeyID), bytes.NewReader(linkBody))
	req2.Header.Set("Authorization", "Bearer "+jwt)
	req2.Header.Set("Content-Type", "application/json")
	http.DefaultClient.Do(req2)
}

// ---------------------------------------------------------------------------
// K8s helpers
// ---------------------------------------------------------------------------

func (s *StoreService) readSecretKey(namespace, secretName, key string) string {
	cmd := exec.Command("kubectl", "get", "secret", secretName, "-n", namespace,
		"-o", fmt.Sprintf("jsonpath={.data.%s}", key))
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(out)))
	if err != nil {
		return ""
	}
	return string(decoded)
}

func (s *StoreService) patchSecret(namespace, secretName, key, value string) error {
	patch := fmt.Sprintf(`{"stringData":{"%s":"%s"}}`, key, value)
	cmd := exec.Command("kubectl", "patch", "secret", secretName, "-n", namespace,
		"--type=merge", "-p", patch)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s: %s", err, stderr.String())
	}
	return nil
}

func (s *StoreService) restartDeployment(namespace, name string) {
	cmd := exec.Command("kubectl", "rollout", "restart", "deployment/"+name, "-n", namespace)
	cmd.Run() // best effort
}

// ---------------------------------------------------------------------------
// Store failure helper
// ---------------------------------------------------------------------------

func (s *StoreService) failStore(store *models.Store, reason string) {
	log.Printf("[provision] %s FAILED: %s", store.ID, reason)
	store.Status = models.StatusFailed
	store.FailReason = reason
	s.repo.Update(store)
	PlatformMetrics.RecordStoreFailed()
	middleware.Audit.Log(middleware.ActionStoreFailed, store.UserID, store.ID, store.Name, reason)
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

func (s *StoreService) GetStore(id string) (*models.Store, error) {
	return s.repo.Get(id)
}

func (s *StoreService) ListStores() (*models.StoreListResponse, error) {
	stores, err := s.repo.GetAll()
	if err != nil {
		return nil, err
	}
	return &models.StoreListResponse{Stores: stores, Count: len(stores)}, nil
}

func (s *StoreService) DeleteStore(id string) error {
	store, err := s.repo.Get(id)
	if err != nil {
		return err
	}
	store.Status = models.StatusDeleting
	s.repo.Update(store)
	go s.deprovisionStore(store)
	return nil
}

func (s *StoreService) deprovisionStore(store *models.Store) {
	lock := s.getStoreLock(store.ID)
	lock.Lock()
	defer lock.Unlock()

	namespace := store.Namespace
	log.Printf("[deprovision] %s: uninstalling from %s", store.ID, namespace)

	if err := s.helmClient.Uninstall(store.ID, namespace); err != nil {
		log.Printf("[deprovision] %s: helm uninstall error: %v", store.ID, err)
		store.Status = models.StatusFailed
		store.FailReason = err.Error()
		s.repo.Update(store)
		return
	}

	s.deleteNamespace(namespace)
	s.repo.Delete(store.ID)

	PlatformMetrics.RecordStoreDeleted()
	middleware.Audit.Log(middleware.ActionStoreDeleted, store.UserID, store.ID, store.Name, "")
	log.Printf("[deprovision] %s: deleted", store.ID)
}

func (s *StoreService) deleteNamespace(namespace string) {
	cmd := exec.Command("kubectl", "delete", "namespace", namespace, "--ignore-not-found", "--wait=false")
	cmd.Run()
}

// ---------------------------------------------------------------------------
// Lock management
// ---------------------------------------------------------------------------

func (s *StoreService) getStoreLock(storeID string) *sync.Mutex {
	s.locksMu.Lock()
	defer s.locksMu.Unlock()
	if m, ok := s.storeLocks[storeID]; ok {
		return m
	}
	m := &sync.Mutex{}
	s.storeLocks[storeID] = m
	return m
}

// ---------------------------------------------------------------------------
// Upgrade / Rollback / History
// ---------------------------------------------------------------------------

func (s *StoreService) UpgradeStore(id string, values map[string]string) error {
	store, err := s.repo.Get(id)
	if err != nil {
		return err
	}
	lock := s.getStoreLock(store.ID)
	lock.Lock()
	defer lock.Unlock()

	return s.helmClient.Upgrade(helm.UpgradeOptions{
		ReleaseName: store.ID,
		Namespace:   store.Namespace,
		Values:      values,
	})
}

func (s *StoreService) RollbackStore(id string, revision int) error {
	store, err := s.repo.Get(id)
	if err != nil {
		return err
	}
	lock := s.getStoreLock(store.ID)
	lock.Lock()
	defer lock.Unlock()

	return s.helmClient.Rollback(store.ID, store.Namespace, revision)
}

func (s *StoreService) GetStoreHistory(id string) ([]helm.HistoryEntry, error) {
	store, err := s.repo.Get(id)
	if err != nil {
		return nil, err
	}
	return s.helmClient.GetHistory(store.ID, store.Namespace)
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type StoreEvent struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"`
}

func (s *StoreService) GetStoreEvents(id string) ([]StoreEvent, error) {
	store, err := s.repo.Get(id)
	if err != nil {
		return nil, err
	}

	cmd := exec.Command("kubectl", "get", "events", "-n", store.Namespace, "-o", "json")
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return []StoreEvent{}, nil
	}

	var result struct {
		Items []struct {
			LastTimestamp   string `json:"lastTimestamp"`
			Type           string `json:"type"`
			Reason         string `json:"reason"`
			Message        string `json:"message"`
			InvolvedObject struct {
				Kind string `json:"kind"`
				Name string `json:"name"`
			} `json:"involvedObject"`
		} `json:"items"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return []StoreEvent{}, nil
	}

	events := make([]StoreEvent, 0, len(result.Items))
	for _, item := range result.Items {
		events = append(events, StoreEvent{
			Timestamp: item.LastTimestamp,
			Type:      item.Type,
			Reason:    item.Reason,
			Message:   item.Message,
			Object:    fmt.Sprintf("%s/%s", item.InvolvedObject.Kind, item.InvolvedObject.Name),
		})
	}
	return events, nil
}

// ---------------------------------------------------------------------------
// Background recovery watcher
// ---------------------------------------------------------------------------

func (s *StoreService) WatchStoreStatus(interval time.Duration, stopCh <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.reconcileStores()
		case <-stopCh:
			return
		}
	}
}

func (s *StoreService) reconcileStores() {
	stores, _ := s.repo.GetAll()
	client := &http.Client{Timeout: 3 * time.Second}

	for _, store := range stores {
		if store.Status != models.StatusProvisioning {
			continue
		}
		storeURL := fmt.Sprintf("http://store-%s.%s", store.ID, s.config.IngressDomain)
		resp, err := client.Get(storeURL + "/health")
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			updated := store
			updated.Status = models.StatusReady
			updated.URL = storeURL
			updated.AdminURL = storeURL + "/app"
			s.repo.Update(&updated)
		}
	}
}
