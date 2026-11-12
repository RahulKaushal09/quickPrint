//go:build windows

package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

// Printers come straight from the Windows spooler (winspool.drv), which works
// the same on Windows 7, 10 and 11 without PowerShell or WMI.

var (
	winspool              = syscall.NewLazyDLL("winspool.drv")
	procEnumPrinters      = winspool.NewProc("EnumPrintersW")
	procGetDefaultPrinter = winspool.NewProc("GetDefaultPrinterW")
	procDeviceCaps        = winspool.NewProc("DeviceCapabilitiesW")
	procOpenPrinter       = winspool.NewProc("OpenPrinterW")
	procClosePrinter      = winspool.NewProc("ClosePrinter")
	procEnumJobs          = winspool.NewProc("EnumJobsW")
	procSetJob            = winspool.NewProc("SetJobW")
	ntdll                 = syscall.NewLazyDLL("ntdll.dll")
	procRtlGetVersion     = ntdll.NewProc("RtlGetVersion")
)

const (
	printerEnumLocal       = 0x2
	printerEnumConnections = 0x4

	statusPaused    = 0x1
	statusError     = 0x2
	statusPaperJam  = 0x8
	statusPaperOut  = 0x10
	statusOffline   = 0x80
	statusNotAvail  = 0x1000
	statusDoorOpen  = 0x400000
	attrWorkOffline = 0x400
)

// PRINTER_INFO_2W. Pointer fields first, then DWORDs, so the layout matches C on 386 and amd64.
type printerInfo2 struct {
	ServerName, PrinterName, ShareName, PortName, DriverName, Comment, Location *uint16
	DevMode, SepFile, PrintProcessor, Datatype, Parameters, SecurityDescriptor  uintptr
	Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status, Jobs   uint32
	AveragePPM                                                                  uint32
}

func utf16ptr(p *uint16) string {
	if p == nil {
		return ""
	}
	n := 0
	for ptr := unsafe.Pointer(p); *(*uint16)(ptr) != 0; n++ {
		ptr = unsafe.Pointer(uintptr(ptr) + 2)
	}
	return syscall.UTF16ToString(unsafe.Slice(p, n))
}

func defaultPrinter() string {
	var size uint32
	procGetDefaultPrinter.Call(0, uintptr(unsafe.Pointer(&size)))
	if size == 0 {
		return ""
	}
	buf := make([]uint16, size)
	r, _, _ := procGetDefaultPrinter.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

// Asking a driver can be slow, and the answers rarely change, so each printer
// is asked once, until the shop presses Refresh.
var (
	capsMu      sync.Mutex
	duplexCache = map[string]bool{}
	trayCache   = map[string][]string{}
)

func forgetPrinterDetails() {
	capsMu.Lock()
	duplexCache = map[string]bool{}
	trayCache = map[string][]string{}
	capsMu.Unlock()
}

// trays lists the paper sources the driver names, e.g. "Tray 1", "Manual Feed".
func trays(name, port string) []string {
	capsMu.Lock()
	defer capsMu.Unlock()
	if v, ok := trayCache[name]; ok {
		return v
	}
	const dcBinNames = 12
	n, _ := syscall.UTF16PtrFromString(name)
	p, _ := syscall.UTF16PtrFromString(port)
	count, _, _ := procDeviceCaps.Call(uintptr(unsafe.Pointer(n)), uintptr(unsafe.Pointer(p)), dcBinNames, 0, 0)
	out := []string{}
	if c := int32(count); c > 0 && c < 100 {
		buf := make([]uint16, int(c)*24) // each name is 24 characters, not always zero-terminated
		procDeviceCaps.Call(uintptr(unsafe.Pointer(n)), uintptr(unsafe.Pointer(p)), dcBinNames, uintptr(unsafe.Pointer(&buf[0])), 0)
		for i := 0; i < int(c); i++ {
			if t := strings.TrimSpace(syscall.UTF16ToString(buf[i*24 : (i+1)*24])); t != "" {
				out = append(out, t)
			}
		}
	}
	trayCache[name] = out
	return out
}

func canDuplex(name, port string) bool {
	capsMu.Lock()
	defer capsMu.Unlock()
	if v, ok := duplexCache[name]; ok {
		return v
	}
	const dcDuplex = 7
	n, _ := syscall.UTF16PtrFromString(name)
	p, _ := syscall.UTF16PtrFromString(port)
	r, _, _ := procDeviceCaps.Call(uintptr(unsafe.Pointer(n)), uintptr(unsafe.Pointer(p)), dcDuplex, 0, 0)
	v := int32(r) == 1
	duplexCache[name] = v
	return v
}

func listPrinters() ([]Printer, error) {
	flags := uintptr(printerEnumLocal | printerEnumConnections)
	var needed, returned uint32
	procEnumPrinters.Call(flags, 0, 2, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return []Printer{}, nil
	}
	buf := make([]byte, needed)
	r, _, err := procEnumPrinters.Call(flags, 0, 2, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return nil, fmt.Errorf("EnumPrinters: %v", err)
	}
	def := defaultPrinter()
	infos := unsafe.Slice((*printerInfo2)(unsafe.Pointer(&buf[0])), returned)
	out := make([]Printer, 0, returned)
	for _, p := range infos {
		name := utf16ptr(p.PrinterName)
		if skipVirtual(name, utf16ptr(p.PortName)) {
			continue
		}
		port := utf16ptr(p.PortName)
		out = append(out, Printer{
			Name: name, Status: printerStatus(p.Status, p.Attributes), IsDefault: name == def, Duplex: canDuplex(name, port), Trays: trays(name, port),
			Driver: utf16ptr(p.DriverName), Location: strings.TrimSpace(utf16ptr(p.Location)), Comment: strings.TrimSpace(utf16ptr(p.Comment)),
		})
	}
	return out, nil
}

// Virtual printers (PDF, XPS, OneNote, Fax) are never what a customer wants.
func skipVirtual(name, port string) bool {
	n := strings.ToLower(name)
	p := strings.ToUpper(port)
	for _, s := range []string{"microsoft print to pdf", "microsoft xps", "onenote", "fax", "send to"} {
		if strings.Contains(n, s) {
			return true
		}
	}
	return p == "PORTPROMPT:" || p == "SHRFAX:" || p == "XPSPORT:" || p == "NUL:"
}

func printerStatus(status, attrs uint32) string {
	switch {
	case attrs&attrWorkOffline != 0, status&(statusOffline|statusNotAvail) != 0:
		return "offline"
	case status&statusPaperOut != 0:
		return "paper_out"
	case status&statusPaperJam != 0:
		return "jammed"
	case status&(statusError|statusDoorOpen|statusPaused) != 0:
		return "error"
	}
	return "ready"
}

func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

// printFile hands the PDF to the printer through SumatraPDF (bundled next to
// the agent), then watches the Windows print queue until the job has left it.
// A job stuck on an empty tray before any page printed is removed and reported
// as *PaperOutError, so the next tray or printer can take it.
func printFile(o *JobOrder, file, tray string, note func(string)) error {
	sumatra := filepath.Join(exeDir(), "SumatraPDF.exe")
	if _, err := os.Stat(sumatra); err != nil {
		return fmt.Errorf("SumatraPDF.exe is missing next to the agent, please reinstall")
	}
	before := map[uint32]bool{}
	for _, j := range queuedJobs(o.Printer) {
		before[j.id] = true
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, sumatra, sumatraArgs(o, file, tray)...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	out, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return fmt.Errorf("printer did not respond within 10 minutes")
	}
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("print failed: %s", msg)
	}
	return watchJob(o, before, note)
}

// ---------------------------------------------------------------- print queue

const (
	jobError            = 0x2
	jobOffline          = 0x20
	jobPaperOut         = 0x40
	jobPrinted          = 0x80
	jobBlocked          = 0x200
	jobUserIntervention = 0x400
	jobComplete         = 0x1000
	jobControlDelete    = 5
)

// JOB_INFO_1W
type jobInfo1 struct {
	JobID                                                              uint32
	PrinterName, MachineName, UserName, Document, Datatype, StatusText *uint16
	Status, Priority, Position, TotalPages, PagesPrinted               uint32
	Submitted                                                          [8]uint16
}

type queuedJob struct {
	id           uint32
	document     string
	status       uint32
	pagesPrinted uint32
}

func openPrinter(name string) (uintptr, bool) {
	n, _ := syscall.UTF16PtrFromString(name)
	var h uintptr
	r, _, _ := procOpenPrinter.Call(uintptr(unsafe.Pointer(n)), uintptr(unsafe.Pointer(&h)), 0)
	return h, r != 0
}

func queuedJobs(printer string) []queuedJob {
	h, ok := openPrinter(printer)
	if !ok {
		return nil
	}
	defer procClosePrinter.Call(h)
	var needed, returned uint32
	procEnumJobs.Call(h, 0, 255, 1, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return nil
	}
	buf := make([]byte, needed)
	r, _, _ := procEnumJobs.Call(h, 0, 255, 1, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed), uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 || returned == 0 {
		return nil
	}
	out := make([]queuedJob, 0, returned)
	for _, j := range unsafe.Slice((*jobInfo1)(unsafe.Pointer(&buf[0])), returned) {
		out = append(out, queuedJob{id: j.JobID, document: utf16ptr(j.Document), status: j.Status, pagesPrinted: j.PagesPrinted})
	}
	return out
}

func deleteJob(printer string, id uint32) {
	if h, ok := openPrinter(printer); ok {
		procSetJob.Call(h, uintptr(id), 0, 0, jobControlDelete)
		procClosePrinter.Call(h)
	}
}

func printerOutOfPaper(name string) bool {
	list, _ := listPrinters()
	for _, p := range list {
		if p.Name == name {
			return p.Status == "paper_out"
		}
	}
	return false
}

func watchJob(o *JobOrder, before map[uint32]bool, note func(string)) error {
	const (
		poll      = 2 * time.Second
		findFor   = 8 * time.Second  // some printers skip the queue; not finding the job means it went straight out
		graceFor  = 25 * time.Second // a problem that lasts this long is real, not a printer warming up
		giveUpFor = 30 * time.Minute
	)
	start := time.Now()
	var id uint32
	var troubleSince time.Time
	noted := false
	for {
		jobs := queuedJobs(o.Printer)
		if id == 0 {
			for _, j := range jobs {
				if !before[j.id] && (strings.Contains(j.document, o.JobID) || id == 0 || j.id < id) {
					id = j.id
					if strings.Contains(j.document, o.JobID) {
						break
					}
				}
			}
			if id == 0 {
				if time.Since(start) > findFor {
					return nil
				}
				time.Sleep(poll)
				continue
			}
		}
		var job *queuedJob
		for i := range jobs {
			if jobs[i].id == id {
				job = &jobs[i]
			}
		}
		if job == nil || job.status&(jobPrinted|jobComplete) != 0 {
			return nil // left the queue: printed
		}
		trouble := job.status&(jobPaperOut|jobUserIntervention|jobError|jobOffline|jobBlocked) != 0 || printerOutOfPaper(o.Printer)
		switch {
		case !trouble:
			troubleSince = time.Time{}
		case troubleSince.IsZero():
			troubleSince = time.Now()
		case time.Since(troubleSince) > graceFor && job.pagesPrinted == 0:
			deleteJob(o.Printer, id)
			reason := "Printer needs attention"
			if job.status&jobPaperOut != 0 || printerOutOfPaper(o.Printer) {
				reason = "Out of paper"
			}
			return &PaperOutError{Reason: reason}
		case time.Since(troubleSince) > graceFor && !noted:
			// Part of it already printed: sending it elsewhere would print those pages twice. Wait for a refill.
			note(fmt.Sprintf("stopped after %d pages, refill paper and it will continue", job.pagesPrinted))
			noted = true
		}
		if time.Since(start) > giveUpFor {
			return fmt.Errorf("the printer has been stuck for 30 minutes, check it and print again")
		}
		time.Sleep(poll)
	}
}

func osDescription() string {
	type osVersionInfo struct {
		Size, Major, Minor, Build, Platform uint32
		CSDVersion                          [128]uint16
	}
	v := osVersionInfo{}
	v.Size = uint32(unsafe.Sizeof(v))
	procRtlGetVersion.Call(uintptr(unsafe.Pointer(&v)))
	name := fmt.Sprintf("Windows %d.%d", v.Major, v.Minor)
	switch {
	case v.Major == 6 && v.Minor == 1:
		name = "Windows 7"
	case v.Major == 6 && v.Minor == 2:
		name = "Windows 8"
	case v.Major == 6 && v.Minor == 3:
		name = "Windows 8.1"
	case v.Major == 10 && v.Build >= 22000:
		name = "Windows 11"
	case v.Major == 10:
		name = "Windows 10"
	}
	return fmt.Sprintf("%s (build %d)", name, v.Build)
}
