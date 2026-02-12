package services

import (
	"sync"
	"time"
)

// TimelineEntry records a point-in-time event for charting
type TimelineEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Event     string    `json:"event"` // created, deleted, failed
}

// RequestStat holds per-endpoint request/error counts
type RequestStat struct {
	Total  int64 `json:"total"`
	Errors int64 `json:"errors"`
}

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

	// API request tracking
	APIRequestsTotal int64 `json:"api_requests_total"`
	APIErrorsTotal   int64 `json:"api_errors_total"`

	// Per-endpoint request stats
	EndpointStats map[string]*RequestStat `json:"endpoint_stats"`

	// Timeline for charts (last 100 events)
	Timeline []TimelineEntry `json:"timeline"`

	// Provisioning durations for histogram (last 50)
	ProvisionDurations []int64 `json:"provision_durations"`
}

// PlatformMetrics is the global metrics instance
var PlatformMetrics = &Metrics{
	EndpointStats:      make(map[string]*RequestStat),
	Timeline:           make([]TimelineEntry, 0, 100),
	ProvisionDurations: make([]int64, 0, 50),
}

// RecordStoreCreated increments store created count
func (m *Metrics) RecordStoreCreated(provisioningTimeMs int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.StoresCreated++
	m.ProvisioningCount++
	m.TotalProvisioningMs += provisioningTimeMs
	m.LastUpdated = time.Now()

	m.Timeline = append(m.Timeline, TimelineEntry{Timestamp: time.Now(), Event: "created"})
	if len(m.Timeline) > 100 {
		m.Timeline = m.Timeline[len(m.Timeline)-100:]
	}

	m.ProvisionDurations = append(m.ProvisionDurations, provisioningTimeMs)
	if len(m.ProvisionDurations) > 50 {
		m.ProvisionDurations = m.ProvisionDurations[len(m.ProvisionDurations)-50:]
	}
}

// RecordStoreFailed increments failed count
func (m *Metrics) RecordStoreFailed() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ProvisioningFailed++
	m.LastUpdated = time.Now()

	m.Timeline = append(m.Timeline, TimelineEntry{Timestamp: time.Now(), Event: "failed"})
	if len(m.Timeline) > 100 {
		m.Timeline = m.Timeline[len(m.Timeline)-100:]
	}
}

// RecordStoreDeleted increments deleted count
func (m *Metrics) RecordStoreDeleted() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.StoresDeleted++
	m.LastUpdated = time.Now()

	m.Timeline = append(m.Timeline, TimelineEntry{Timestamp: time.Now(), Event: "deleted"})
	if len(m.Timeline) > 100 {
		m.Timeline = m.Timeline[len(m.Timeline)-100:]
	}
}

// SetActiveStores updates the active store count
func (m *Metrics) SetActiveStores(count int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ActiveStores = count
	m.LastUpdated = time.Now()
}

// RecordAPIRequest tracks an API request
func (m *Metrics) RecordAPIRequest(endpoint string, isError bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.APIRequestsTotal++
	if isError {
		m.APIErrorsTotal++
	}

	stat, ok := m.EndpointStats[endpoint]
	if !ok {
		stat = &RequestStat{}
		m.EndpointStats[endpoint] = stat
	}
	stat.Total++
	if isError {
		stat.Errors++
	}
}

// GetSnapshot returns a copy of current metrics
func (m *Metrics) GetSnapshot() MetricsSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	avgTime := int64(0)
	if m.ProvisioningCount > 0 {
		avgTime = m.TotalProvisioningMs / m.ProvisioningCount
	}

	// Copy endpoint stats
	endpointStats := make(map[string]*RequestStat, len(m.EndpointStats))
	for k, v := range m.EndpointStats {
		endpointStats[k] = &RequestStat{Total: v.Total, Errors: v.Errors}
	}

	// Copy timeline
	timeline := make([]TimelineEntry, len(m.Timeline))
	copy(timeline, m.Timeline)

	// Copy provision durations
	durations := make([]int64, len(m.ProvisionDurations))
	copy(durations, m.ProvisionDurations)

	// Calculate success rate
	successRate := float64(100)
	if m.APIRequestsTotal > 0 {
		successRate = float64(m.APIRequestsTotal-m.APIErrorsTotal) / float64(m.APIRequestsTotal) * 100
	}

	return MetricsSnapshot{
		StoresCreated:         m.StoresCreated,
		StoresDeleted:         m.StoresDeleted,
		ProvisioningFailures:  m.ProvisioningFailed,
		AvgProvisioningTimeMs: avgTime,
		ActiveStores:          m.ActiveStores,
		LastUpdated:           m.LastUpdated,
		APIRequestsTotal:      m.APIRequestsTotal,
		APIErrorsTotal:        m.APIErrorsTotal,
		APISuccessRate:        successRate,
		EndpointStats:         endpointStats,
		Timeline:              timeline,
		ProvisionDurations:    durations,
	}
}

// MetricsSnapshot is a point-in-time copy of metrics
type MetricsSnapshot struct {
	StoresCreated         int64                  `json:"stores_created"`
	StoresDeleted         int64                  `json:"stores_deleted"`
	ProvisioningFailures  int64                  `json:"provisioning_failures"`
	AvgProvisioningTimeMs int64                  `json:"avg_provisioning_time_ms"`
	ActiveStores          int                    `json:"active_stores"`
	LastUpdated           time.Time              `json:"last_updated"`
	APIRequestsTotal      int64                  `json:"api_requests_total"`
	APIErrorsTotal        int64                  `json:"api_errors_total"`
	APISuccessRate        float64                `json:"api_success_rate"`
	EndpointStats         map[string]*RequestStat `json:"endpoint_stats"`
	Timeline              []TimelineEntry        `json:"timeline"`
	ProvisionDurations    []int64                `json:"provision_durations"`
}
