package main

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Windows 7 PCs that never got updates lack newer root certificates (Let's
// Encrypt's ISRG Root X1 among them), so the agent ships its own CA bundle
// instead of trusting the OS store.
//
//go:embed certs/roots.pem
var rootsPEM []byte

func tlsConfig() *tls.Config {
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(rootsPEM)
	return &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
}

var httpClient = &http.Client{
	Timeout:   5 * time.Minute,
	Transport: &http.Transport{TLSClientConfig: tlsConfig(), Proxy: http.ProxyFromEnvironment, MaxIdleConns: 4},
}

type apiError struct {
	Status int
	Msg    string
}

func (e *apiError) Error() string { return e.Msg }

func apiURL(server, path string) string {
	return strings.TrimRight(server, "/") + path
}

func postJSON(url string, body any, out any) error {
	b, _ := json.Marshal(body)
	res, err := httpClient.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("could not reach the server (%v)", err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		var e struct{ Error string }
		_ = json.Unmarshal(data, &e)
		if e.Error == "" {
			e.Error = res.Status
		}
		return &apiError{res.StatusCode, e.Error}
	}
	return json.Unmarshal(data, out)
}

// download saves an API file to path using the device token.
func download(cfg *Config, path, dest string) error {
	req, _ := http.NewRequest("GET", apiURL(cfg.Server, path), nil)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	res, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("download failed: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("download failed: %s", res.Status)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	n, err := io.Copy(f, res.Body)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil && n == 0 {
		err = errors.New("downloaded file is empty")
	}
	return err
}
