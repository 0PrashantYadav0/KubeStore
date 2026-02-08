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
	Status     StoreStatus `json:"status"`
	URL        string      `json:"url,omitempty"`
	CreatedAt  time.Time   `json:"created_at"`
	UpdatedAt  time.Time   `json:"updated_at"`
	FailReason string      `json:"fail_reason,omitempty"`
}

// CreateStoreRequest represents the request body for creating a store
type CreateStoreRequest struct {
	Name string `json:"name"`
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
	return nil
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
