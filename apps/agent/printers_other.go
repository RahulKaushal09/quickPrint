//go:build !windows

package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// Simulated printers for developing on macOS/Linux: "printing" copies the
// PDF into dev-data/outbox/<printer>/ so the whole flow can be tested.

func listPrinters() ([]Printer, error) {
	return []Printer{
		{Name: "Canon LBP2900", Status: "ready", IsDefault: true},
		{Name: "Epson L3150 Series", Status: "ready"},
	}, nil
}

func printFile(o *JobOrder, file string) error {
	time.Sleep(1500 * time.Millisecond) // feel like a printer
	dir := filepath.Join(dataDir(), "outbox", o.Printer)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	mode := "bw"
	if o.Color {
		mode = "color"
	}
	dest := filepath.Join(dir, fmt.Sprintf("%s_%s_%dx_%s.pdf", o.PickupCode, mode, o.Copies, o.JobID))
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

func osDescription() string { return runtime.GOOS + " (simulated printers)" }
