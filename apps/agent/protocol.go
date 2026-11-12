package main

// Mirrors packages/shared/src/protocol.ts. Change both together.

type Printer struct {
	Name      string   `json:"name"`
	Status    string   `json:"status"` // ready | offline | paper_out | jammed | error | busy
	IsDefault bool     `json:"isDefault"`
	Duplex    bool     `json:"duplex"`
	Trays     []string `json:"trays,omitempty"`
	Driver    string   `json:"driver,omitempty"`   // names the model
	Location  string   `json:"location,omitempty"` // typed by the owner in Windows
	Comment   string   `json:"comment,omitempty"`
}

type JobOrder struct {
	JobID      string   `json:"jobId"`
	Printer    string   `json:"printer"`
	Copies     int      `json:"copies"`
	Color      bool     `json:"color"`
	Duplex     bool     `json:"duplex"`
	// Both sides by hand: fronts and backs come as two files (?side=front, ?side=back)
	// with every copy inside, and the shop turns the stack over in between.
	ManualDuplex bool   `json:"manualDuplex,omitempty"`
	Run          int    `json:"run,omitempty"` // counts reprints, so a reprint isn't skipped as already printed
	PrinterLabel string `json:"printerLabel,omitempty"`
	Kind       string   `json:"kind,omitempty"`  // "photo" prints at exact size
	Paper      string   `json:"paper,omitempty"` // photos: "A4", or "4x6" for the driver's own photo paper
	Trays      []string `json:"trays,omitempty"` // in order of preference; empty = the printer decides
	Pages      int      `json:"pages"`
	FileName   string   `json:"fileName"`
	FileURL    string   `json:"fileUrl"`
	PickupCode string   `json:"pickupCode"`
}

type serverMessage struct {
	Type     string    `json:"type"`
	DeviceID string    `json:"deviceId,omitempty"`
	ShopName string    `json:"shopName,omitempty"`
	ShopCode string    `json:"shopCode,omitempty"`
	Job      *JobOrder `json:"job,omitempty"`
	Error    string    `json:"error,omitempty"`
}

type helloMessage struct {
	Type     string    `json:"type"`
	Version  string    `json:"version"`
	OS       string    `json:"os"`
	Hostname string    `json:"hostname"`
	Printers []Printer `json:"printers"`
}

type printersMessage struct {
	Type     string    `json:"type"`
	Printers []Printer `json:"printers"`
}

type jobMessage struct {
	Type  string `json:"type"`
	JobID string `json:"jobId"`
	Error string `json:"error,omitempty"`
	Code  string `json:"code,omitempty"`
}

// PaperOutError means the job stopped before any page came out, so it is
// safe to send it again to another tray or printer.
type PaperOutError struct{ Reason string }

func (e *PaperOutError) Error() string { return e.Reason }
