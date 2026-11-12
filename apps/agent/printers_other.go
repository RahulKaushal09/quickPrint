//go:build !windows

package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Simulated printers for developing on macOS/Linux: "printing" copies the
// PDF into dev-data/outbox/<printer>/ so the whole flow can be tested.
// List "Printer|Tray" lines in dev-data/empty-trays.txt to make a tray run out
// of paper ("Printer|*" for the printer's own choice).

func listPrinters() ([]Printer, error) {
	return []Printer{
		{Name: "Canon LBP2900", Status: "ready", IsDefault: true, Trays: []string{"Tray 1", "Manual feed"}, Driver: "Canon LBP2900", Location: "Counter"},
		{Name: "Epson L3150 Series", Status: "ready", Duplex: true, Trays: []string{"Rear tray", "Photo tray"}, Driver: "EPSON L3150 Series"},
	}, nil
}

func printFile(o *JobOrder, file, tray string, _ func(string)) error {
	time.Sleep(1500 * time.Millisecond) // feel like a printer
	want := o.Printer + "|" + tray
	if tray == "" {
		want = o.Printer + "|*"
	}
	if b, err := os.ReadFile(filepath.Join(dataDir(), "empty-trays.txt")); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			if strings.TrimSpace(line) == want {
				return &PaperOutError{Reason: "Out of paper"}
			}
		}
	}
	dir := filepath.Join(dataDir(), "outbox", o.Printer)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	mode := "bw"
	if o.Color {
		mode = "color"
	}
	sides := "single"
	if o.Duplex {
		sides = "double"
	}
	if o.Kind == "photo" {
		mode = "photo-" + o.Paper
	}
	if tray == "" {
		tray = "auto"
	}
	dest := filepath.Join(dir, fmt.Sprintf("%s_%s_%s_%s_%dx_%s", o.PickupCode, mode, sides, strings.ReplaceAll(tray, " ", "-"), o.Copies, filepath.Base(file)))
	src, err := os.Open(file)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	logf("simulated print -> %s", dest)
	return err
}

func forgetPrinterDetails() {}

func osDescription() string { return runtime.GOOS + " (simulated printers)" }
