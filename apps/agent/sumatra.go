package main

import (
	"fmt"
	"strings"
)

// sumatraArgs builds the SumatraPDF command line. Kept OS-independent so it
// is unit-tested on any machine.
//
//	SumatraPDF.exe -print-to "<printer>" -silent -exit-when-done -print-settings "2x,monochrome,fit,paper=A4" file.pdf
func sumatraArgs(o *JobOrder, file string) []string {
	copies := o.Copies
	if copies < 1 {
		copies = 1
	}
	color := "monochrome"
	if o.Color {
		color = "color"
	}
	// fit = scale every page to the printable area of A4, so nothing is cut off.
	settings := []string{fmt.Sprintf("%dx", copies), color, "fit", "paper=A4"}
	return []string{"-print-to", o.Printer, "-silent", "-exit-when-done", "-print-settings", strings.Join(settings, ","), file}
}
