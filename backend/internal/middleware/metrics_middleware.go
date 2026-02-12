package middleware

import (
	"net/http"
	"strings"
)

// ResponseCapture wraps http.ResponseWriter to capture the status code
type ResponseCapture struct {
	http.ResponseWriter
	StatusCode int
}

// WriteHeader captures the status code
func (rc *ResponseCapture) WriteHeader(code int) {
	rc.StatusCode = code
	rc.ResponseWriter.WriteHeader(code)
}

// MetricsRecorderFunc is a callback for recording request metrics
type MetricsRecorderFunc func(endpoint string, isError bool)

// metricsRecorder is the global callback set by the app
var metricsRecorder MetricsRecorderFunc

// SetMetricsRecorder sets the global metrics recorder callback
func SetMetricsRecorder(fn MetricsRecorderFunc) {
	metricsRecorder = fn
}

// RequestMetricsMiddleware counts API requests and errors per endpoint
func RequestMetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc := &ResponseCapture{ResponseWriter: w, StatusCode: http.StatusOK}
		next.ServeHTTP(rc, r)

		if metricsRecorder == nil {
			return
		}

		// Normalize the endpoint path (strip IDs)
		endpoint := normalizeEndpoint(r.Method, r.URL.Path)
		isError := rc.StatusCode >= 400

		metricsRecorder(endpoint, isError)
	})
}

// normalizeEndpoint turns e.g. "GET /api/stores/s1234/pods" into "GET /api/stores/:id/pods"
func normalizeEndpoint(method, path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	normalized := make([]string, 0, len(parts))
	for i, p := range parts {
		// If previous segment is "stores" and this looks like a store ID, replace with :id
		if i > 0 && parts[i-1] == "stores" && len(p) > 0 && p[0] == 's' {
			normalized = append(normalized, ":id")
		} else {
			normalized = append(normalized, p)
		}
	}
	return method + " /" + strings.Join(normalized, "/")
}
