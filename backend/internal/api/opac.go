package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

func getOpacAPIURL() string {
	url := strings.Trim(os.Getenv("OPAC_API_URL"), `"' `)
	if url == "" {
		url = "https://apiopac.rmutsv.ac.th/v1/api/"
	}
	return url
}

func getOpacAPIToken() string {
	return strings.Trim(os.Getenv("OPAC_API_TOKEN"), `"' `)
}

func doRequest(endpoint string) ([]byte, error) {
	reqURL := getOpacAPIURL() + endpoint
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	// Add Authorization header
	token := getOpacAPIToken()
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status: %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

// PatronDetail represents the response from GetPatronDetail API
type PatronDetail struct {
	Barcode    string      `json:"BARCODE"`
	FNameThai  string      `json:"FNAMETHAI"`
	LNameThai  string      `json:"LNAMETHAI"`
	InformDate string      `json:"INFORMDATE"`
	InformTime string      `json:"INFORMTIME"`
	CiractName string      `json:"CIRACTNAME"`
	UserID     interface{} `json:"USERID"`
	Mobile     string      `json:"MOBILE"`
	Email      string      `json:"EMAIL"`
}

func GetPatronDetail(userBarcode string) ([]PatronDetail, error) {
	data, err := doRequest(fmt.Sprintf("GetPatronDetail/%s", userBarcode))
	if err != nil {
		return nil, err
	}

	var result []PatronDetail
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// PatronBorrow represents a borrowed item from GetPatronBorrow API
type PatronBorrow struct {
	No           interface{} `json:"NO"`
	Barcode      string      `json:"BARCODE"`
	BibID        string      `json:"BIBID"`
	Title        string      `json:"TITLE"`
	MatTypeID    interface{} `json:"MATTYPEID"`
	Author       string      `json:"AUTHOR"`
	CallNo       string      `json:"CALLNO"`
	Renew        interface{} `json:"RENEW"`
	CheckOutDate string      `json:"CHECKOUTDATE"`
	DueDate      string      `json:"DUEDATE"`
}

func GetPatronBorrow(userBarcode string) ([]PatronBorrow, error) {
	data, err := doRequest(fmt.Sprintf("GetPatronBorrow/%s", userBarcode))
	if err != nil {
		return nil, err
	}

	var result []PatronBorrow
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// BibInfo represents the basic info of a book from GetBibInfo API
type BibInfo struct {
	Field string `json:"FIELD"`
	Data  string `json:"DATA"`
}

func GetBibInfo(bibID string) ([]BibInfo, error) {
	data, err := doRequest(fmt.Sprintf("GetBibInfo/%s", bibID))
	if err != nil {
		return nil, err
	}

	var wrapper struct {
		BibInfo []BibInfo `json:"BibInfo"`
	}
	// The API returns {"BibInfo": [ ... ]}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		// Sometimes it might return just an array depending on the API's actual response structure.
		// The PDF shows: {"BibInfo": [ { "FIELD": "ISBN", "DATA": "..." }, ... ]}
		return nil, err
	}
	return wrapper.BibInfo, nil
}

// Item represents a book item from GetItem API
type Item struct {
	Barcode         string `json:"BARCODE"`
	CallNo          string `json:"CALLNO"`
	AccessionNo     string `json:"ACCESSIONNO"`
	Unit            string `json:"UNIT"`
	Copy            string `json:"COPY"`
	CollectionName  string `json:"COLLECTIONNAME"`
	ItemClassName   string `json:"ITEMCLASSNAME"`
	ItemStatusName  string `json:"ITEMSTATUSNAME"`
	LocationInitial string `json:"LOCATIONINITIAL"`
}

func GetItem(bibID string) ([]Item, error) {
	data, err := doRequest(fmt.Sprintf("GetItem/%s", bibID))
	if err != nil {
		return nil, err
	}

	var wrapper struct {
		ItemInfo []Item `json:"ItemInfo"` // Assuming wrapper, PDF shows "ItemInfo": [ ... ]
	}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.ItemInfo, nil
}
