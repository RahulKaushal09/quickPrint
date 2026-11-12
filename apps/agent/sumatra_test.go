package main

import (
	"reflect"
	"testing"
)

func TestSumatraArgs(t *testing.T) {
	got := sumatraArgs(&JobOrder{Printer: "HP LaserJet", Copies: 3, Color: false}, `C:\work\a.pdf`, "")
	want := []string{"-print-to", "HP LaserJet", "-silent", "-exit-when-done", "-print-settings", "3x,monochrome,simplex,fit,paper=A4", `C:\work\a.pdf`}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v", got)
	}
	got = sumatraArgs(&JobOrder{Printer: "Epson", Copies: 0, Color: true, Duplex: true}, "b.pdf", "")
	if got[5] != "1x,color,duplexlong,fit,paper=A4" {
		t.Fatalf("got %v", got[5])
	}
}

func TestSumatraTraysAndPhotos(t *testing.T) {
	got := sumatraArgs(&JobOrder{Printer: "HP", Copies: 1}, "a.pdf", "Tray 2, Manual")
	if got[5] != "1x,monochrome,simplex,fit,paper=A4,bin=Tray 2  Manual" {
		t.Fatalf("got %v", got[5])
	}
	got = sumatraArgs(&JobOrder{Printer: "Epson", Copies: 2, Kind: "photo", Paper: "4x6"}, "p.pdf", "Photo tray")
	if got[5] != "2x,color,simplex,noscale,bin=Photo tray" {
		t.Fatalf("got %v", got[5])
	}
	got = sumatraArgs(&JobOrder{Printer: "Epson", Copies: 1, Kind: "photo", Paper: "A4"}, "p.pdf", "")
	if got[5] != "1x,color,simplex,noscale,paper=A4" {
		t.Fatalf("got %v", got[5])
	}
}

func TestTrayFallback(t *testing.T) {
	var tried []string
	var notes []string
	empty := map[string]bool{"Tray 1": true}
	print := func(tray string) error {
		tried = append(tried, tray)
		if empty[tray] {
			return &PaperOutError{Reason: "Out of paper"}
		}
		return nil
	}
	if err := printWithTrays([]string{"Tray 1", "Tray 2"}, print, func(n string) { notes = append(notes, n) }); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(tried, []string{"Tray 1", "Tray 2"}) || len(notes) != 1 {
		t.Fatalf("tried %v notes %v", tried, notes)
	}
	empty["Tray 2"] = true
	tried = nil
	err := printWithTrays([]string{"Tray 1", "Tray 2"}, print, func(string) {})
	if _, ok := err.(*PaperOutError); !ok || len(tried) != 2 {
		t.Fatalf("want paper out after both trays, got %v %v", err, tried)
	}
	tried = nil
	if err := printWithTrays(nil, print, func(string) {}); err != nil || !reflect.DeepEqual(tried, []string{""}) {
		t.Fatalf("no trays should let the printer choose: %v %v", err, tried)
	}
}

func TestLedger(t *testing.T) {
	l := &ledger{}
	l.add("a")
	if !l.has("a") {
		t.Fatal("ledger lost entry")
	}
	for i := 0; i < ledgerSize+10; i++ {
		l.add(string(rune('A'+i%26)) + string(rune(i)))
	}
	if len(l.Items) > ledgerSize {
		t.Fatalf("ledger grew to %d", len(l.Items))
	}
}
