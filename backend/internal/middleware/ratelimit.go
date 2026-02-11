package middleware

import (
	"log"
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements a token bucket rate limiter per IP
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int           // requests per window
	window   time.Duration // time window
}

type visitor struct {
	tokens    int
	lastReset time.Time
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		window:   window,
	}
	// Cleanup goroutine
	go rl.cleanup()
	return rl
}

// Allow checks if a request is allowed
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	if !exists {
		rl.visitors[ip] = &visitor{
			tokens:    rl.rate - 1,
			lastReset: time.Now(),
		}
		return true
	}

	// Reset tokens if window has passed
	if time.Since(v.lastReset) > rl.window {
		v.tokens = rl.rate - 1
		v.lastReset = time.Now()
		return true
	}

	// Check if tokens available
	if v.tokens > 0 {
		v.tokens--
		return true
	}

	return false
}

// cleanup removes old entries
func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(rl.window)
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.lastReset) > rl.window*2 {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// Global rate limiter: 100 requests per 15 minutes
var GlobalLimiter = NewRateLimiter(100, 15*time.Minute)

// StoreCreationLimiter: 3 stores per minute
var StoreCreationLimiter = NewRateLimiter(3, time.Minute)

// RateLimitMiddleware applies global rate limiting
func RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getIP(r)
		if !GlobalLimiter.Allow(ip) {
			log.Printf("Rate limit exceeded for IP: %s", ip)
			http.Error(w, `{"error":"Too many requests, please try again later"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// StoreCreationRateLimit checks store creation rate limit
func StoreCreationRateLimit(ip string) bool {
	return StoreCreationLimiter.Allow(ip)
}

// getIP extracts client IP from request
func getIP(r *http.Request) string {
	// Check X-Forwarded-For header first
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		return forwarded
	}
	// Check X-Real-IP header
	realIP := r.Header.Get("X-Real-IP")
	if realIP != "" {
		return realIP
	}
	return r.RemoteAddr
}
