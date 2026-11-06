package main

import (
	"reflect"
	"testing"
)

func TestSumatraArgs(t *testing.T) {
	got := sumatraArgs(&JobOrder{Printer: "HP LaserJet", Copies: 3, Color: false}, `C:\work\a.pdf`)
	want := []string{"-print-to", "HP LaserJet", "-silent", "-exit-when-done", "-print-settings", "3x,monochrome,fit,paper=A4", `C:\work\a.pdf`}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v", got)
	}
	got = sumatraArgs(&JobOrder{Printer: "Epson", Copies: 0, Color: true}, "b.pdf")
	if got[5] != "1x,color,fit,paper=A4" {
		t.Fatalf("got %v", got[5])
	}
}

func TestLedger(t *testing.T) {
	l := &ledger{}
	l.add("a", "printed")
	if s, ok := l.get("a"); !ok || s != "printed" {
		t.Fatal("ledger lost entry")
	}
	for i := 0; i < ledgerSize+10; i++ {
		l.add(string(rune('A'+i%26))+string(rune(i)), "printed")
	}
	if len(l.Items) > ledgerSize {
		t.Fatalf("ledger grew to %d", len(l.Items))
	}
}
