package models

import (
	"strings"
	"testing"
)

func TestCreateStoreRequest_Validate(t *testing.T) {
	tests := []struct {
		name    string
		req     CreateStoreRequest
		wantErr error
	}{
		{"missing name", CreateStoreRequest{}, ErrStoreNameRequired},
		{"short name", CreateStoreRequest{Name: "ab"}, ErrStoreNameTooShort},
		{"long name", CreateStoreRequest{Name: strings.Repeat("a", 51)}, ErrStoreNameTooLong},
		{"invalid engine", CreateStoreRequest{Name: "shop", Engine: "magento"}, ErrInvalidEngine},
		{"valid default engine", CreateStoreRequest{Name: "shop"}, nil},
		{"valid medusa engine", CreateStoreRequest{Name: "shop", Engine: "medusa"}, nil},
		{"valid woocommerce engine", CreateStoreRequest{Name: "shop", Engine: "woocommerce"}, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.req.Validate()
			if tt.wantErr == nil && err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
			if tt.wantErr != nil && err == nil {
				t.Fatalf("expected error %v, got nil", tt.wantErr)
			}
			if tt.wantErr != nil && err != tt.wantErr {
				t.Fatalf("expected error %v, got %v", tt.wantErr, err)
			}
		})
	}
}

