package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Agent keeps one WebSocket to the server, reconnecting forever, and prints
// the jobs it receives one at a time in arrival order.

type recentJob struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Printer string    `json:"printer"`
	Copies  int       `json:"copies"`
	Color   bool      `json:"color"`
	Pickup  string    `json:"pickup"`
	Status  string    `json:"status"`
	Error   string    `json:"error,omitempty"`
	At      time.Time `json:"at"`
}

type Agent struct {
	mu        sync.Mutex
	cfg       *Config
	conn      *websocket.Conn
	writeMu   sync.Mutex
	connected bool
	lastError string
	since     time.Time
	printers  []Printer
	recent    []recentJob
	queue     chan *JobOrder
	pending   map[string]bool
	done      *ledger
	wake      chan struct{} // re-pairing from the status page restarts the loop immediately
}

func newAgent(cfg *Config) *Agent {
	return &Agent{cfg: cfg, queue: make(chan *JobOrder, 200), pending: map[string]bool{}, done: loadLedger(), wake: make(chan struct{}, 1)}
}

func (a *Agent) config() *Config {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.cfg
}

func (a *Agent) setConfig(c *Config) {
	a.mu.Lock()
	a.cfg = c
	conn := a.conn
	a.mu.Unlock()
	if conn != nil {
		conn.Close()
	}
	select {
	case a.wake <- struct{}{}:
	default:
	}
}

func (a *Agent) send(v any) error {
	a.mu.Lock()
	conn := a.conn
	a.mu.Unlock()
	if conn == nil {
		return fmt.Errorf("not connected")
	}
	a.writeMu.Lock()
	defer a.writeMu.Unlock()
	conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	return conn.WriteJSON(v)
}

func wsURL(server string) string {
	u := strings.TrimRight(server, "/")
	u = strings.Replace(u, "https://", "wss://", 1)
	u = strings.Replace(u, "http://", "ws://", 1)
	return u + "/api/agent/ws"
}

func (a *Agent) Run() {
	go a.worker()
	go a.watchPrinters()
	backoff := 2 * time.Second
	for {
		cfg := a.config()
		if cfg == nil {
			a.setState(false, "Not paired yet. Open the status page and enter a pairing code.")
			a.sleep(30 * time.Second)
			continue
		}
		start := time.Now()
		err := a.session(cfg)
		a.setState(false, errText(err))
		if err != nil {
			logf("connection ended: %v", err)
		}
		if time.Since(start) > time.Minute {
			backoff = 2 * time.Second
		}
		a.sleep(backoff)
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (a *Agent) sleep(d time.Duration) {
	select {
	case <-time.After(d):
	case <-a.wake:
	}
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (a *Agent) setState(connected bool, lastErr string) {
	a.mu.Lock()
	a.connected = connected
	if connected {
		a.since = time.Now()
	}
	if lastErr != "" || connected {
		a.lastError = lastErr
	}
	a.mu.Unlock()
}

func (a *Agent) session(cfg *Config) error {
	dialer := websocket.Dialer{HandshakeTimeout: 20 * time.Second, TLSClientConfig: tlsConfig(), Proxy: http.ProxyFromEnvironment}
	h := http.Header{}
	h.Set("Authorization", "Bearer "+cfg.Token)
	conn, res, err := dialer.Dial(wsURL(cfg.Server), h)
	if err != nil {
		if res != nil && res.StatusCode == 401 {
			return fmt.Errorf("this PC was removed from the shop dashboard. Pair it again with a new code")
		}
		return fmt.Errorf("cannot reach %s (%v)", cfg.Server, err)
	}
	conn.SetReadLimit(1 << 20)
	a.mu.Lock()
	a.conn = conn
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		a.conn = nil
		a.mu.Unlock()
		conn.Close()
	}()

	host, _ := os.Hostname()
	printers, _ := listPrinters()
	a.mu.Lock()
	a.printers = printers
	a.mu.Unlock()
	if err := a.send(helloMessage{Type: "hello", Version: version, OS: osDescription(), Hostname: host, Printers: printers}); err != nil {
		return err
	}
	a.setState(true, "")
	logf("connected to %s", cfg.Server)

	stop := make(chan struct{})
	defer close(stop)
	go func() {
		t := time.NewTicker(20 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				if a.send(map[string]string{"type": "ping"}) != nil {
					conn.Close()
					return
				}
			}
		}
	}()

	for {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		var msg serverMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return err
		}
		switch msg.Type {
		case "welcome":
			if msg.ShopName != cfg.ShopName || msg.ShopCode != cfg.ShopCode {
				c := *cfg
				c.ShopName, c.ShopCode = msg.ShopName, msg.ShopCode
				_ = saveConfig(&c)
				a.mu.Lock()
				a.cfg = &c
				a.mu.Unlock()
			}
		case "job":
			if msg.Job != nil {
				a.enqueue(msg.Job)
			}
		case "error":
			logf("server: %s", msg.Error)
		}
	}
}

func (a *Agent) enqueue(o *JobOrder) {
	// The server may resend a job after a reconnect. Never print it twice.
	if status, ok := a.done.get(o.JobID); ok {
		a.report(o.JobID, "job.accepted", "")
		a.report(o.JobID, status, a.done.errorFor(o.JobID))
		return
	}
	a.mu.Lock()
	if a.pending[o.JobID] {
		a.mu.Unlock()
		a.report(o.JobID, "job.accepted", "")
		return
	}
	a.pending[o.JobID] = true
	a.mu.Unlock()
	a.report(o.JobID, "job.accepted", "")
	a.track(o, "waiting", "")
	a.queue <- o
}

func (a *Agent) report(jobID, typ, errMsg string) {
	if err := a.send(jobMessage{Type: typ, JobID: jobID, Error: errMsg}); err != nil {
		logf("could not report %s for %s: %v", typ, jobID, err)
	}
}

func (a *Agent) worker() {
	work := filepath.Join(dataDir(), "work")
	_ = os.MkdirAll(work, 0o755)
	for o := range a.queue {
		err := a.printOne(o, work)
		status, msg := "job.printed", ""
		if err != nil {
			status, msg = "job.failed", err.Error()
			logf("job %s failed: %v", o.JobID, err)
		} else {
			logf("job %s printed on %s (%d copies)", o.JobID, o.Printer, o.Copies)
		}
		if !strings.HasPrefix(o.JobID, "test-") {
			a.done.add(o.JobID, status, msg)
		}
		a.mu.Lock()
		delete(a.pending, o.JobID)
		a.mu.Unlock()
		a.track(o, map[string]string{"job.printed": "printed", "job.failed": "failed"}[status], msg)
		a.report(o.JobID, status, msg)
	}
}

func (a *Agent) printOne(o *JobOrder, work string) error {
	cfg := a.config()
	if cfg == nil {
		return fmt.Errorf("PC is not paired")
	}
	a.track(o, "downloading", "")
	file := filepath.Join(work, o.JobID+".pdf")
	defer os.Remove(file)
	if err := download(cfg, o.FileURL, file); err != nil {
		return err
	}
	a.track(o, "printing", "")
	a.report(o.JobID, "job.printing", "")
	return printFile(o, file)
}

func (a *Agent) track(o *JobOrder, status, errMsg string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for i := range a.recent {
		if a.recent[i].ID == o.JobID {
			a.recent[i].Status, a.recent[i].Error, a.recent[i].At = status, errMsg, time.Now()
			return
		}
	}
	a.recent = append([]recentJob{{ID: o.JobID, Name: o.FileName, Printer: o.Printer, Copies: o.Copies, Color: o.Color, Pickup: o.PickupCode, Status: status, Error: errMsg, At: time.Now()}}, a.recent...)
	if len(a.recent) > 30 {
		a.recent = a.recent[:30]
	}
}

// watchPrinters re-reads the printer list and tells the server when it changes
// (a printer switched off, out of paper, newly installed).
func (a *Agent) watchPrinters() {
	for range time.Tick(15 * time.Second) {
		list, err := listPrinters()
		if err != nil {
			logf("listing printers: %v", err)
			continue
		}
		a.mu.Lock()
		changed := !reflect.DeepEqual(list, a.printers)
		a.printers = list
		a.mu.Unlock()
		if changed {
			_ = a.send(printersMessage{Type: "printers", Printers: list})
		}
	}
}

// ---------------------------------------------------------------- ledger

// The ledger remembers the last few hundred finished jobs on disk, so a job
// re-sent after a crash or reconnect is reported instead of printed again.

const ledgerSize = 500

type ledgerItem struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

type ledger struct {
	mu    sync.Mutex
	Items []ledgerItem `json:"items"`
}

func ledgerPath() string { return filepath.Join(dataDir(), "printed.json") }

func loadLedger() *ledger {
	l := &ledger{}
	if b, err := os.ReadFile(ledgerPath()); err == nil {
		_ = json.Unmarshal(b, l)
	}
	return l
}

func (l *ledger) get(id string) (string, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, it := range l.Items {
		if it.ID == id {
			return it.Status, true
		}
	}
	return "", false
}

func (l *ledger) errorFor(id string) string {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, it := range l.Items {
		if it.ID == id {
			return it.Error
		}
	}
	return ""
}

func (l *ledger) add(id, status string, errMsg ...string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	it := ledgerItem{ID: id, Status: status}
	if len(errMsg) > 0 {
		it.Error = errMsg[0]
	}
	l.Items = append(l.Items, it)
	if len(l.Items) > ledgerSize {
		l.Items = l.Items[len(l.Items)-ledgerSize:]
	}
	if b, err := json.Marshal(l); err == nil && dataDir() != "" {
		_ = os.MkdirAll(dataDir(), 0o755)
		_ = os.WriteFile(ledgerPath(), b, 0o644)
	}
}
