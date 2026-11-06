package main

import (
	"html/template"
	"net"
	"net/http"
	"strings"
	"time"
)

// A small status page on http://localhost:47210 so the shop can see whether
// the PC is connected, which printers it found and what it printed. Plain
// HTML with a meta refresh: it has to work in Internet Explorer 11 on Windows 7.

const statusAddr = "127.0.0.1:47210"

var statusTmpl = template.Must(template.New("s").Funcs(template.FuncMap{
	"ago": func(t time.Time) string {
		d := time.Since(t).Round(time.Second)
		switch {
		case d < time.Minute:
			return "just now"
		case d < time.Hour:
			return strings.TrimSuffix(d.Truncate(time.Minute).String(), "0s") + " ago"
		}
		return t.Format("02 Jan 15:04")
	},
}).Parse(`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta http-equiv="refresh" content="5"><title>QuickPrint Agent</title>
<style>
body{margin:0;background:#f4f5f8;font-family:"Segoe UI",Arial,sans-serif;color:#0b1220}
.wrap{max-width:760px;margin:0 auto;padding:28px 20px}
.brand{font-size:20px;font-weight:700;letter-spacing:-.2px}
.brand span{display:inline-block;width:10px;height:10px;margin-right:3px;border-radius:5px}
.card{background:#fff;border:1px solid #e3e6ee;border-radius:14px;padding:20px 22px;margin-top:16px}
.state{font-size:22px;font-weight:700}
.ok{color:#0a7a4f}.bad{color:#c2410c}
.muted{color:#5b6475;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}
td,th{text-align:left;padding:8px 6px;border-bottom:1px solid #eef0f4}
th{color:#5b6475;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
.pill{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:600;background:#eef0f4}
.pill.ready,.pill.printed{background:#dcf5e8;color:#0a7a4f}
.pill.failed,.pill.offline,.pill.error,.pill.jammed,.pill.paper_out{background:#fde8dc;color:#c2410c}
input{font-size:18px;padding:8px 10px;border:1px solid #cfd4de;border-radius:8px;letter-spacing:2px;text-transform:uppercase}
button{font-size:15px;padding:9px 18px;border:0;border-radius:8px;background:#0b1220;color:#fff;cursor:pointer}
</style></head><body><div class="wrap">
<div class="brand"><span style="background:#00aeef"></span><span style="background:#ec008c"></span><span style="background:#ffe600"></span> QuickPrint Agent <span class="muted">v{{.Version}}</span></div>
<div class="card">
{{if .Connected}}<div class="state ok">&#9679; Connected</div><div class="muted">{{.Shop}} &middot; {{.Server}} &middot; since {{ago .Since}}</div>
{{else if .Paired}}<div class="state bad">&#9679; Not connected</div><div class="muted">{{.Error}}</div><div class="muted">Retrying automatically. Check the internet connection.</div>
{{else}}<div class="state bad">This PC is not paired</div>
<p class="muted">In the QuickPrint dashboard open <b>Printers &rarr; Add shop PC</b> and type the code here.</p>{{end}}
{{if .ShowPair}}<form method="post" action="/pair" style="margin-top:14px">
<input name="code" maxlength="12" placeholder="PAIRING CODE" autocomplete="off">
<input name="server" value="{{.ServerValue}}" style="letter-spacing:0;text-transform:none;font-size:13px;width:260px">
<button type="submit">Pair this PC</button></form>{{if .PairMsg}}<p class="muted">{{.PairMsg}}</p>{{end}}{{end}}
</div>
<div class="card"><b>Printers on this PC</b>
<table><tr><th>Printer</th><th>Status</th><th></th></tr>
{{range .Printers}}<tr><td>{{.Name}}</td><td><span class="pill {{.Status}}">{{.Status}}</span></td><td class="muted">{{if .IsDefault}}Windows default{{end}}</td></tr>
{{else}}<tr><td colspan="3" class="muted">No printers found. Install the printer driver in Windows first.</td></tr>{{end}}
</table></div>
<div class="card"><b>Recent prints</b>
<table><tr><th>Code</th><th>File</th><th>Printer</th><th>Status</th><th>When</th></tr>
{{range .Recent}}<tr><td><b>{{.Pickup}}</b></td><td>{{.Name}} <span class="muted">&times;{{.Copies}} {{if .Color}}colour{{else}}B/W{{end}}</span></td><td class="muted">{{.Printer}}</td>
<td><span class="pill {{.Status}}">{{.Status}}</span>{{if .Error}}<div class="muted">{{.Error}}</div>{{end}}</td><td class="muted">{{ago .At}}</td></tr>
{{else}}<tr><td colspan="5" class="muted">Nothing printed since the agent started.</td></tr>{{end}}
</table></div>
<p class="muted">Logs: {{.DataDir}}</p>
</div></body></html>`))

func (a *Agent) serveStatus(ln net.Listener) {
	pairMsg := ""
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		cfg := a.cfg
		data := map[string]any{
			"Version": version, "Connected": a.connected, "Since": a.since, "Error": a.lastError,
			"Printers": a.printers, "Recent": a.recent, "DataDir": dataDir(), "PairMsg": pairMsg,
			"Paired": cfg != nil, "ShowPair": cfg == nil || !a.connected, "ServerValue": defaultServer,
		}
		a.mu.Unlock()
		if cfg != nil {
			data["Shop"] = cfg.ShopName
			data["Server"] = cfg.Server
			data["ServerValue"] = cfg.Server
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = statusTmpl.Execute(w, data)
	})
	mux.HandleFunc("/pair", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			c, err := pair(r.FormValue("code"), r.FormValue("server"))
			if err != nil {
				pairMsg = err.Error()
			} else {
				pairMsg = "Paired with " + c.ShopName + "."
				a.setConfig(c)
			}
		}
		http.Redirect(w, r, "/", http.StatusSeeOther)
	})
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	_ = srv.Serve(ln)
}
