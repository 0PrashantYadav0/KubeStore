package models

import "time"

// StoreStatus represents the current status of a store
type StoreStatus string

const (
	StatusProvisioning StoreStatus = "provisioning"
	StatusReady        StoreStatus = "ready"
	StatusFailed       StoreStatus = "failed"
	StatusDeleting     StoreStatus = "deleting"
)

// Store represents an e-commerce store instance
type Store struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Engine     string      `json:"engine,omitempty"` // medusa | woocommerce
	Status     StoreStatus `json:"status"`
	URL        string      `json:"url,omitempty"`
	AdminURL   string      `json:"admin_url,omitempty"`
	Namespace  string      `json:"namespace,omitempty"`
	UserID     string      `json:"user_id,omitempty"`
	CreatedAt  time.Time   `json:"created_at"`
	UpdatedAt  time.Time   `json:"updated_at"`
	FailReason string      `json:"fail_reason,omitempty"`
}

// CreateStoreRequest represents the request body for creating a store
type CreateStoreRequest struct {
	Name   string `json:"name"`
	Engine string `json:"engine,omitempty"` // default: medusa
}

// Validate validates the create store request
func (r *CreateStoreRequest) Validate() error {
	if r.Name == "" {
		return ErrStoreNameRequired
	}
	if len(r.Name) < 3 {
		return ErrStoreNameTooShort
	}
	if len(r.Name) > 50 {
		return ErrStoreNameTooLong
	}
	if r.Engine != "" && r.Engine != "medusa" && r.Engine != "woocommerce" {
		return ErrInvalidEngine
	}
	return nil
}

// UpgradeStoreRequest represents the request body for upgrading a store
type UpgradeStoreRequest struct {
	Values map[string]string `json:"values,omitempty"`
}

// RollbackStoreRequest represents the request body for rolling back a store
type RollbackStoreRequest struct {
	Revision int `json:"revision"`
}

// StoreListResponse represents the response for listing stores
type StoreListResponse struct {
	Stores []Store `json:"stores"`
	Count  int     `json:"count"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}
