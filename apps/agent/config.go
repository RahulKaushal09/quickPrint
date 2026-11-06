package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

// Config is written by `pair` and read on every start.
type Config struct {
	Server   string `json:"server"`
	DeviceID string `json:"deviceId"`
	Token    string `json:"token"`
	ShopName string `json:"shopName"`
	ShopCode string `json:"shopCode"`
}

var devMode bool

// dataDir is C:\ProgramData\SeedhaPrintAgent on Windows (shared by every user
// of the PC, kept across updates) and ./dev-data when developing elsewhere.
func dataDir() string {
	if runtime.GOOS == "windows" && !devMode {
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "SeedhaPrintAgent")
	}
	return "dev-data"
}

func configPath() string { return filepath.Join(dataDir(), "config.json") }

var cfgMu sync.Mutex

func loadConfig() (*Config, error) {
	b, err := os.ReadFile(configPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, err
	}
	if c.Token == "" || c.Server == "" {
		return nil, nil
	}
	return &c, nil
}

func saveConfig(c *Config) error {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	if err := os.MkdirAll(dataDir(), 0o755); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(c, "", "  ")
	tmp := configPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	_ = os.Remove(configPath()) // Windows rename does not overwrite
	return os.Rename(tmp, configPath())
}
