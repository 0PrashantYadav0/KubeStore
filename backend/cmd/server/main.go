package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/kubestore/backend/internal/api"
	"github.com/kubestore/backend/internal/helm"
	"github.com/kubestore/backend/internal/repository"
	"github.com/kubestore/backend/internal/services"
)

func main() {
	// Configuration from environment
	port := getEnv("PORT", "8080")
	chartPath := getEnv("HELM_CHART_PATH", "./charts/medusa-store")
	wooChartPath := getEnv("HELM_CHART_PATH_WOOCOMMERCE", "./charts/woocommerce-store")
	ingressDomain := getEnv("INGRESS_DOMAIN", "127.0.0.1.nip.io")
	valuesFile := getEnv("HELM_VALUES_FILE", "")
	storeDBPath := getEnv("STORE_DB_PATH", "./data/kubestore.db")

	maxStoresTotal := getEnvInt("MAX_STORES_TOTAL", 50)
	maxStoresPerUser := getEnvInt("MAX_STORES_PER_USER", 5)
	provisionWorkers := getEnvInt("PROVISION_WORKERS", 3)

	// Convert to absolute path - try multiple locations
	chartPath = resolveChartPath(chartPath)
	wooChartPath = resolveChartPath(wooChartPath)
	valuesFile = resolveOptionalFile(valuesFile)

	log.Printf("Starting KubeStore Backend")
	log.Printf("  Port: %s", port)
	log.Printf("  Helm Chart (Medusa): %s", chartPath)
	log.Printf("  Helm Chart (WooCommerce): %s", wooChartPath)
	log.Printf("  Ingress Domain: %s", ingressDomain)
	if valuesFile != "" {
		log.Printf("  Helm Values: %s", valuesFile)
	}
	log.Printf("  Store DB: %s", storeDBPath)

	// Initialize components
	var repo repository.StoreRepository
	if boltRepo, err := repository.NewBoltRepository(storeDBPath); err == nil {
		repo = boltRepo
		defer boltRepo.Close()
	} else {
		log.Printf("Warning: failed to open store DB (%v); falling back to in-memory repo", err)
		repo = repository.NewInMemoryRepository()
	}

	helmClient := helm.NewClient(helm.Config{
		ChartPath:     chartPath,
		IngressDomain: ingressDomain,
		ValuesFile:    valuesFile,
	})

	storeService := services.NewStoreService(repo, helmClient, services.Config{
		MaxStoresTotal:        maxStoresTotal,
		MaxStoresPerUser:      maxStoresPerUser,
		ProvisionWorkers:      provisionWorkers,
		IngressDomain:         ingressDomain,
		ChartPath:             chartPath,
		WooCommerceChartPath:  wooChartPath,
	})

	handler := api.NewHandler(storeService)
	router := api.NewRouter(handler)

	// Start status watcher
	stopCh := make(chan struct{})
	go storeService.WatchStoreStatus(30*time.Second, stopCh)

	// Create server
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Server listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	close(stopCh)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced shutdown: %v", err)
	}

	log.Println("Server exited cleanly")
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	raw := getEnv(key, "")
	if raw == "" {
		return defaultValue
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return defaultValue
	}
	return v
}

// resolveChartPath finds and returns absolute path to chart
func resolveChartPath(chartPath string) string {
	// Try the provided path first
	if absPath, err := filepath.Abs(chartPath); err == nil {
		if _, err := os.Stat(absPath); err == nil {
			return absPath
		}
	}

	// Extract chart name from path for fallback search
	chartName := filepath.Base(chartPath)
	// Try common relative paths
	paths := []string{
		"./charts/" + chartName,
		"../charts/" + chartName,
		"../../charts/" + chartName,
	}

	for _, p := range paths {
		if absPath, err := filepath.Abs(p); err == nil {
			if _, err := os.Stat(absPath); err == nil {
				log.Printf("  Found chart at: %s", absPath)
				return absPath
			}
		}
	}

	log.Printf("  Warning: Could not locate Helm chart: %s", chartPath)
	return chartPath
}

func resolveOptionalFile(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	if abs, err := filepath.Abs(p); err == nil {
		if _, err := os.Stat(abs); err == nil {
			return abs
		}
	}
	// Leave as-is (Helm will error with a clear message if not found).
	return p
}
