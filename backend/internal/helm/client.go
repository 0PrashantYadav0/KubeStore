package helm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Config holds Helm client configuration
type Config struct {
	ChartPath     string
	IngressDomain string
	ValuesFile    string // optional: values-production.yaml etc
}

// Client wraps Helm CLI operations
type Client struct {
	config Config
}

// NewClient creates a new Helm client
func NewClient(config Config) *Client {
	return &Client{
		config: config,
	}
}

// InstallOptions configures a Helm install
type InstallOptions struct {
	ReleaseName string
	Namespace   string
	StoreID     string
	StoreName   string
	ChartPath   string // override chart path (engine-specific); falls back to config.ChartPath
	Values      map[string]string
}

// Install installs a Helm release
func (c *Client) Install(opts InstallOptions) error {
	chartPath := c.config.ChartPath
	if opts.ChartPath != "" {
		chartPath = opts.ChartPath
	}

	args := []string{
		"install",
		opts.ReleaseName,
		chartPath,
		"--namespace", opts.Namespace,
		"--create-namespace",
		"--no-hooks",
		"--timeout", "10m",
	}

	if strings.TrimSpace(c.config.ValuesFile) != "" {
		args = append(args, "-f", c.config.ValuesFile)
	}

	// Add store-specific values
	args = append(args, "--set", fmt.Sprintf("store.id=%s", opts.StoreID))
	args = append(args, "--set", fmt.Sprintf("store.name=%s", opts.StoreName))
	args = append(args, "--set", fmt.Sprintf("ingress.baseDomain=%s", c.config.IngressDomain))

	// Add any additional values
	for key, value := range opts.Values {
		args = append(args, "--set", fmt.Sprintf("%s=%s", key, value))
	}

	cmd := exec.Command("helm", args...)
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("helm install failed: %s, stderr: %s", err, stderr.String())
	}

	return nil
}

// Uninstall removes a Helm release
func (c *Client) Uninstall(releaseName, namespace string) error {
	args := []string{
		"uninstall",
		releaseName,
		"--namespace", namespace,
		"--wait",
	}

	cmd := exec.Command("helm", args...)
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// Ignore "not found" errors during uninstall
		if strings.Contains(stderr.String(), "not found") {
			return nil
		}
		return fmt.Errorf("helm uninstall failed: %s, stderr: %s", err, stderr.String())
	}

	return nil
}

// Status represents Helm release status
type Status struct {
	Deployed bool
	Failed   bool
	Pending  bool
}

// GetStatus gets the status of a Helm release
func (c *Client) GetStatus(releaseName, namespace string) (*Status, error) {
	args := []string{
		"status",
		releaseName,
		"--namespace", namespace,
		"-o", "json",
	}

	cmd := exec.Command("helm", args...)
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if strings.Contains(stderr.String(), "not found") {
			return nil, nil
		}
		return nil, fmt.Errorf("helm status failed: %s, stderr: %s", err, stderr.String())
	}

	output := stdout.String()
	status := &Status{}

	if strings.Contains(output, "deployed") {
		status.Deployed = true
	} else if strings.Contains(output, "failed") {
		status.Failed = true
	} else if strings.Contains(output, "pending") {
		status.Pending = true
	}

	return status, nil
}

// ReleaseExists checks if a Helm release exists
func (c *Client) ReleaseExists(releaseName, namespace string) (bool, error) {
	cmd := exec.Command("helm", "list", "-n", namespace, "-q")
	cmd.Env = os.Environ()

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return false, err
	}

	releases := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	for _, release := range releases {
		if release == releaseName {
			return true, nil
		}
	}

	return false, nil
}

// UpgradeOptions configures a Helm upgrade
type UpgradeOptions struct {
	ReleaseName string
	Namespace   string
	ChartPath   string // override chart path (engine-specific); falls back to config.ChartPath
	Values      map[string]string
}

// Upgrade upgrades a Helm release
func (c *Client) Upgrade(opts UpgradeOptions) error {
	chartPath := c.config.ChartPath
	if opts.ChartPath != "" {
		chartPath = opts.ChartPath
	}

	args := []string{
		"upgrade",
		opts.ReleaseName,
		chartPath,
		"--namespace", opts.Namespace,
		"--wait",
		"--timeout", "5m",
	}

	if strings.TrimSpace(c.config.ValuesFile) != "" {
		args = append(args, "-f", c.config.ValuesFile)
	}

	// Add any additional values
	for key, value := range opts.Values {
		args = append(args, "--set", fmt.Sprintf("%s=%s", key, value))
	}

	cmd := exec.Command("helm", args...)
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("helm upgrade failed: %s, stderr: %s", err, stderr.String())
	}

	return nil
}

// Rollback rolls back a Helm release to a specific revision
func (c *Client) Rollback(releaseName, namespace string, revision int) error {
	args := []string{
		"rollback",
		releaseName,
		fmt.Sprintf("%d", revision),
		"--namespace", namespace,
		"--wait",
	}

	cmd := exec.Command("helm", args...)
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("helm rollback failed: %s, stderr: %s", err, stderr.String())
	}

	return nil
}

// HistoryEntry represents a Helm release history entry
type HistoryEntry struct {
	Revision    int    `json:"revision"`
	Updated     string `json:"updated"`
	Status      string `json:"status"`
	Chart       string `json:"chart"`
	AppVersion  string `json:"app_version"`
	Description string `json:"description"`
}

// GetHistory gets the history of a Helm release
func (c *Client) GetHistory(releaseName, namespace string) ([]HistoryEntry, error) {
	args := []string{
		"history",
		releaseName,
		"--namespace", namespace,
		"-o", "json",
	}

	cmd := exec.Command("helm", args...)
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if strings.Contains(stderr.String(), "not found") {
			return nil, nil
		}
		return nil, fmt.Errorf("helm history failed: %s, stderr: %s", err, stderr.String())
	}

	var history []HistoryEntry
	if err := json.Unmarshal(stdout.Bytes(), &history); err != nil {
		return nil, fmt.Errorf("failed to parse helm history: %s", err)
	}

	return history, nil
}
