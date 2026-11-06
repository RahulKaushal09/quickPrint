package main

// Mirrors packages/shared/src/protocol.ts. Change both together.

type Printer struct {
	Name      string `json:"name"`
	Status    string `json:"status"` // ready | offline | paper_out | jammed | error | busy
	IsDefault bool   `json:"isDefault"`
}

type JobOrder struct {
	JobID      string `json:"jobId"`
	Printer    string `json:"printer"`
	Copies     int    `json:"copies"`
	Color      bool   `json:"color"`
	Pages      int    `json:"pages"`
	FileName   string `json:"fileName"`
	FileURL    string `json:"fileUrl"`
	PickupCode string `json:"pickupCode"`
}

type serverMessage struct {
	Type      string    `json:"type"`
	DeviceID  string    `json:"deviceId,omitempty"`
	ShopName  string    `json:"shopName,omitempty"`
	ShopCode  string    `json:"shopCode,omitempty"`
	Job       *JobOrder `json:"job,omitempty"`
	Error     string    `json:"error,omitempty"`
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
}
