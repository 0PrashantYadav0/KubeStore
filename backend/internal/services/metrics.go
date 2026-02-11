package services

import (
	"sync"
	"time"
)

// Metrics holds platform-wide metrics
type Metrics struct {
	mu                  sync.RWMutex
	StoresCreated       int64     `json:"stores_created"`
	StoresDeleted       int64     `json:"stores_deleted"`
	ProvisioningFailed  int64     `json:"provisioning_failures"`
	TotalProvisioningMs int64     `json:"total_provisioning_ms"`
	ProvisioningCount   int64     `json:"provisioning_count"`
	ActiveStores        int       `json:"active_stores"`
	LastUpdated         time.Time `json:"last_updated"`
}

// PlatformMetrics is the global metrics instance
var PlatformMetrics = &Metrics{}

// RecordStoreCreated increments store created count
func (m *Metrics) RecordStoreCreated(provisioningTimeMs int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.StoresCreated++
	m.ProvisioningCount++
	m.TotalProvisioningMs += provisioningTimeMs
	m.LastUpdated = time.Now()
}

// RecordStoreFailed increments failed count
func (m *Metrics) RecordStoreFailed() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ProvisioningFailed++
	m.LastUpdated = time.Now()
}

// RecordStoreDeleted increments deleted count
func (m *Metrics) RecordStoreDeleted() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.StoresDeleted++
	m.LastUpdated = time.Now()
}

// SetActiveStores updates the active store count
func (m *Metrics) SetActiveStores(count int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ActiveStores = count
	m.LastUpdated = time.Now()
}

// GetSnapshot returns a copy of current metrics
func (m *Metrics) GetSnapshot() MetricsSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	avgTime := int64(0)
	if m.ProvisioningCount > 0 {
		avgTime = m.TotalProvisioningMs / m.ProvisioningCount
	}

	return MetricsSnapshot{
		StoresCreated:         m.StoresCreated,
		StoresDeleted:         m.StoresDeleted,
		ProvisioningFailures:  m.ProvisioningFailed,
		AvgProvisioningTimeMs: avgTime,
		ActiveStores:          m.ActiveStores,
		LastUpdated:           m.LastUpdated,
	}
}

// MetricsSnapshot is a point-in-time copy of metrics
type MetricsSnapshot struct {
	StoresCreated         int64     `json:"stores_created"`
	StoresDeleted         int64     `json:"stores_deleted"`
	ProvisioningFailures  int64     `json:"provisioning_failures"`
	AvgProvisioningTimeMs int64     `json:"avg_provisioning_time_ms"`
	ActiveStores          int       `json:"active_stores"`
	LastUpdated           time.Time `json:"last_updated"`
}
