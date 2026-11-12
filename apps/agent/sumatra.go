package main

import (
	"errors"
	"fmt"
	"strings"
)

// sumatraArgs builds the SumatraPDF command line. Kept OS-independent so it
// is unit-tested on any machine.
//
//	SumatraPDF.exe -print-to "<printer>" -silent -exit-when-done -print-settings "2x,monochrome,duplexlong,fit,paper=A4,bin=Tray 2" file.pdf
//
// tray is a name Windows reported for this printer, or "" to let the printer choose.
func sumatraArgs(o *JobOrder, file, tray string) []string {
	copies := o.Copies
	if copies < 1 {
		copies = 1
	}
	color := "monochrome"
	if o.Color {
		color = "color"
	}
	sides := "simplex"
	if o.Duplex {
		// Pages are always upright A4 by now, so long-edge binding reads like a book.
		sides = "duplexlong"
	}
	// fit = scale every page to the printable area of A4, so nothing is cut off.
	settings := []string{fmt.Sprintf("%dx", copies), color, sides, "fit", "paper=A4"}
	if o.Kind == "photo" {
		// Passport photos must come out at their exact size. 4x6 photo paper uses the driver's own paper setting.
		settings = []string{fmt.Sprintf("%dx", copies), "color", "simplex", "noscale"}
		if o.Paper != "4x6" {
			settings = append(settings, "paper=A4")
		}
	}
	if tray != "" {
		// Commas separate settings, so they can't appear inside a tray name.
		settings = append(settings, "bin="+strings.ReplaceAll(tray, ",", " "))
	}
	return []string{"-print-to", o.Printer, "-silent", "-exit-when-done", "-print-settings", strings.Join(settings, ","), file}
}

// printWithTrays tries each tray in order. A tray that is out of paper before
// anything printed hands over to the next one; any other result ends there.
func printWithTrays(trays []string, print func(tray string) error, note func(string)) error {
	if len(trays) == 0 {
		trays = []string{""}
	}
	var err error
	for i, tray := range trays {
		err = print(tray)
		var out *PaperOutError
		if !errors.As(err, &out) || i == len(trays)-1 {
			return err
		}
		note(fmt.Sprintf("%s: %s, using %s", tray, strings.ToLower(out.Reason), trays[i+1]))
	}
	return err
}
