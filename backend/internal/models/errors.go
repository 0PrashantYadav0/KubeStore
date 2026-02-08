package models

import "errors"

// Custom errors for store operations
var (
	ErrStoreNotFound     = errors.New("store not found")
	ErrStoreNameRequired = errors.New("store name is required")
	ErrStoreNameTooShort = errors.New("store name must be at least 3 characters")
	ErrStoreNameTooLong  = errors.New("store name must be at most 50 characters")
	ErrStoreExists       = errors.New("store already exists")
	ErrMaxStoresReached  = errors.New("maximum number of stores reached")
	ErrProvisionFailed   = errors.New("store provisioning failed")
	ErrDeleteFailed      = errors.New("store deletion failed")
)
