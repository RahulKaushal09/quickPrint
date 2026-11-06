// SeedhaPrint Agent: connects a print shop's Windows PC to SeedhaPrint and
// prints paid customer jobs on the shop's printers.
//
//	SeedhaPrintAgent.exe                     run (what the Startup shortcut does)
//	SeedhaPrintAgent.exe pair CODE [SERVER]  pair this PC with a shop (used by the installer)
//	SeedhaPrintAgent.exe status              open the status page
//
// Built with Go 1.20 for windows/386 so a single exe runs on Windows 7, 8, 10
// and 11, 32- and 64-bit.
package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

var (
	version       = "dev"                   // set by the build: -X main.version=1.0.0
	defaultServer = "http://localhost:4100" // set by the build: -X main.defaultServer=https://api.example.com
)

func main() {
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		if args[i] == "--dev" {
			devMode = true
			args = append(args[:i], args[i+1:]...)
			i--
		}
	}
	cmd := "run"
	if len(args) > 0 {
		cmd = strings.TrimLeft(args[0], "-")
		args = args[1:]
	}
	switch cmd {
	case "run":
		run()
	case "pair":
		if len(args) < 1 {
			fail("usage: SeedhaPrintAgent pair CODE [SERVER]")
		}
		server := defaultServer
		if len(args) > 1 && args[1] != "" {
			server = args[1]
		}
		c, err := pair(args[0], server)
		if err != nil {
			fail(err.Error())
		}
		fmt.Printf("This PC is now connected to %s.", c.ShopName)
	case "status":
		openBrowser("http://" + statusAddr)
	case "version":
		fmt.Println(version)
	default:
		fail("unknown command " + cmd)
	}
}

func fail(msg string) {
	fmt.Print(msg)
	os.Exit(1)
}

func pair(code, server string) (*Config, error) {
	code = strings.ToUpper(strings.NewReplacer(" ", "", "-", "").Replace(code))
	server = strings.TrimRight(strings.TrimSpace(server), "/")
	if code == "" {
		return nil, fmt.Errorf("type the pairing code from the dashboard")
	}
	if !strings.HasPrefix(server, "http://") && !strings.HasPrefix(server, "https://") {
		return nil, fmt.Errorf("server address must start with https://")
	}
	host, _ := os.Hostname()
	var res struct {
		DeviceID, Token, ShopName, ShopCode string
	}
	if err := postJSON(apiURL(server, "/api/agent/pair"), map[string]string{"code": code, "hostname": host, "os": osDescription(), "version": version}, &res); err != nil {
		return nil, err
	}
	c := &Config{Server: server, DeviceID: res.DeviceID, Token: res.Token, ShopName: res.ShopName, ShopCode: res.ShopCode}
	if err := saveConfig(c); err != nil {
		return nil, fmt.Errorf("paired, but could not save settings: %v", err)
	}
	return c, nil
}

func run() {
	_ = os.MkdirAll(dataDir(), 0o755)
	setupLog()

	// The status port doubles as a single-instance lock.
	ln, err := net.Listen("tcp", statusAddr)
	if err != nil {
		logf("another copy of the agent is already running, exiting")
		return
	}
	cfg, err := loadConfig()
	if err != nil {
		logf("reading config: %v", err)
	}
	logf("SeedhaPrint Agent %s starting on %s, data in %s", version, osDescription(), dataDir())
	a := newAgent(cfg)
	go a.serveStatus(ln)
	if cfg == nil && runtime.GOOS == "windows" {
		openBrowser("http://" + statusAddr)
	}
	a.Run()
}

// ---------------------------------------------------------------- logging

var logger = log.New(os.Stderr, "", log.LstdFlags)

func setupLog() {
	p := filepath.Join(dataDir(), "agent.log")
	if fi, err := os.Stat(p); err == nil && fi.Size() > 2<<20 {
		_ = os.Remove(p + ".1")
		_ = os.Rename(p, p+".1")
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	var w io.Writer = f
	if devMode || runtime.GOOS != "windows" {
		w = io.MultiWriter(f, os.Stderr)
	}
	logger.SetOutput(w)
}

func logf(format string, v ...any) { logger.Printf(format, v...) }

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		_ = exec.Command("open", url).Start()
	default:
		_ = exec.Command("xdg-open", url).Start()
	}
}
