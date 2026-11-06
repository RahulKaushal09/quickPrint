//go:build windows

package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

// Asking a driver can be slow, and the answer doesn't change, so each printer is asked once.
var duplexCache = map[string]bool{}

func canDuplex(name, port string) bool {
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
		out = append(out, Printer{Name: name, Status: printerStatus(p.Status, p.Attributes), IsDefault: name == def, Duplex: canDuplex(name, port)})
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
// the agent). It returns once the job is in the Windows print queue.
func printFile(o *JobOrder, file string) error {
	sumatra := filepath.Join(exeDir(), "SumatraPDF.exe")
	if _, err := os.Stat(sumatra); err != nil {
		return fmt.Errorf("SumatraPDF.exe is missing next to the agent, please reinstall")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, sumatra, sumatraArgs(o, file)...)
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
	return nil
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
