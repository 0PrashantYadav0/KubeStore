package middleware

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

// AuditAction represents an audit action type
type AuditAction string

const (
	ActionStoreCreated    AuditAction = "STORE_CREATED"
	ActionStoreDeleted    AuditAction = "STORE_DELETED"
	ActionStoreUpgraded   AuditAction = "STORE_UPGRADED"
	ActionStoreRolledBack AuditAction = "STORE_ROLLED_BACK"
	ActionStoreFailed     AuditAction = "STORE_CREATION_FAILED"
	ActionRateLimitHit    AuditAction = "RATE_LIMIT_EXCEEDED"
	ActionQuotaExceeded   AuditAction = "QUOTA_EXCEEDED"
)

// AuditEntry represents a single audit log entry
type AuditEntry struct {
	ID        string      `json:"id"`
	Action    AuditAction `json:"action"`
	UserID    string      `json:"userId"`
	StoreID   string      `json:"storeId,omitempty"`
	StoreName string      `json:"storeName,omitempty"`
	Details   string      `json:"details,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// AuditLogger manages audit log entries
type AuditLogger struct {
	mu      sync.RWMutex
	entries []AuditEntry
	maxSize int
}

// Global audit logger
var Audit = NewAuditLogger(1000)

// NewAuditLogger creates a new audit logger
func NewAuditLogger(maxSize int) *AuditLogger {
	return &AuditLogger{
		entries: make([]AuditEntry, 0),
		maxSize: maxSize,
	}
}

// Log adds an audit entry
func (al *AuditLogger) Log(action AuditAction, userID, storeID, storeName, details string) {
	al.mu.Lock()
	defer al.mu.Unlock()

	entry := AuditEntry{
		ID:        time.Now().Format("20060102150405") + "-" + randomString(6),
		Action:    action,
		UserID:    userID,
		StoreID:   storeID,
		StoreName: storeName,
		Details:   details,
		Timestamp: time.Now(),
	}

	al.entries = append(al.entries, entry)

	// Trim to max size
	if len(al.entries) > al.maxSize {
		al.entries = al.entries[1:]
	}

	// Also log to stdout
	jsonBytes, _ := json.Marshal(entry)
	log.Printf("AUDIT: %s", string(jsonBytes))
}

// GetEntries returns recent audit entries
func (al *AuditLogger) GetEntries(limit int, userID, storeID string) []AuditEntry {
	al.mu.RLock()
	defer al.mu.RUnlock()

	var filtered []AuditEntry
	for i := len(al.entries) - 1; i >= 0 && len(filtered) < limit; i-- {
		entry := al.entries[i]
		if userID != "" && entry.UserID != userID {
			continue
		}
		if storeID != "" && entry.StoreID != storeID {
			continue
		}
		filtered = append(filtered, entry)
	}

	return filtered
}

// Helper to generate random string
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}
