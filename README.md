# lfn-sftp-client v1.0.0 beta

There are two environment variables that are needed to process the WebHook notifications:

**SLACK_WEBHOOK_URL**=https://hooks.slack.com/services/...
**MS_TEAMS_WEBHOOK_URL**=https://lineagefn.webhook.office.com/webhookb2/...

The application will error out with `Error: Incoming webhook URL is required`

For DEV, add a .env file in the `/src` folder


## Build the Moov Wire Module

We are utilizing a Go module from Moov to do the Wire tasks. This will save considerable time and will utilize a stable library for these tasks.

### Install TinyGo

https://tinygo.org/getting-started/install/

**macOS**
#### macOS install guide
This page has information on how to install and use TinyGo on macOS. If you wish to build TinyGo from source, for example if you intend to contribute to the project, please take a look here.

You must have Go v1.15+ already installed on your machine in order to install TinyGo. We recommend Go v1.17+.

You can use Homebrew to install TinyGo using the following commands:

https://egghead.io/lessons/go-optimize-go-webassembly-binary-size-with-tinygo

```
brew tap tinygo-org/tools
brew install tinygo
```

### Export the WASM
Here are the steps to update this export this module:

Note: You must comment the function in the Go source code that you want exported in the WASM. And this MUST be directly above the function with no spaces.
```
\\export {FunctionName}
```

1. install Go
1. Pull down the repository git@github.com:moov-io/wire.git 
1. Navigate to the folder 'wire' folder at the root of the moov-io repository that was just cloned
1. From the command prompt, navigate to `./wire/cmd/webui/wire/`, use Go to build the source with this command `GOOS=js GOARCH=wasm go build -o wire.wasm wire_js.go`
1. Ensure the Hex prefix of the file content for `wire.wasm` is `0061 736d` or it is not a valid WASM file!
1. Copy the `main.wasm` file into the project in the `./src/baas/wire/` folder


### Build the MOOV ACH Tools locally

1. Install Go
1. Pull down the repo git@github.com:moov-io/ach.git
1. Checkout the version you want to build
1. Build the achcli files for windows and mac

bash:
```
git fetch --all --tags
git checkout tags/v1.26.0 -b v1.26.0
cd /ach/cmd/achcli
GOOS=windows GOARCH=amd64 go build -o bin/achcli-1-26-0.exe main.go diff.go reformat.go describe.go
GOOS=darwin GOARCH=amd64 go build -o bin/achcli-1-26-0 main.go diff.go reformat.go describe.go
```
1. copy these files into the `tools` directory
1. update the ach processing code to reference these new versions


### Invoice processing

1. Connect to the SQL server [sqlserver9ed7a961.database.windows.net] using the credentials in 1Password

1. Set up the new invoices in the database in **baas.invoices** for the processing range and ensure it is unlocked.

1. Run the invoicing for each environment, execute the baas.processing.invoicing.invoiceprocessing()
    - this parses the transactions and breaks out return data / additional metadata needed for unvoicing
    - This is a LONG RUNNING process because it accesses the LOB space to read the dataJSON from the largest table in the database

1. There are a couple of views that will help export the data for invoicing:
    - v_InvoiceFiles - List the files that are included in the invoices
    - v_InvoiceTransactions - List the transactions that are included in the invoices

1. The views can be executed and used to export the results in Excel using Azure Data Studio:

Transaction:
```
SELECT [invoiceNumber]
      ,[invoicedOrganizationId]
      ,[organizationNumber]
      ,[organizationName]
      ,[invoiceBeginDate]
      ,[fileReceivedDate]
      ,[invoiceEndDate]
      ,[internalNote]
      ,[invoiceNote]
      ,[sha256]
      ,[fileName]
      ,[fileNameOutbound]
      ,[fileTypeName]
      ,[isOutboundToFed]
      ,[isInboundFromFed]
      ,[quickBalanceJSON]
      ,[isProcessed]
      ,[isRejected]
      ,[hasProcessingErrors]
      ,[transactionEntityId]
      ,[transactionId]
      ,[batchId]
      ,[originationDate]
      ,[effectiveDate]
      ,[paymentRelatedInformation]
      ,[transactionType]
      ,[tracenumber]
      ,[transactionCredit]
      ,[transactionDebit]
      ,[mutatedBy]
      ,[mutatedDate]
      ,[isACH]
      ,[isWire]
      ,[isReturn]
      ,[returnType]
      ,[OMAD]
      ,[IMAD]
      ,[RDFI]
      ,[DFIaccount]
      ,[isIAT]
      ,[isJsonParsed]
  FROM [dbo].[v_InvoiceTransactions]
 -- Order By [invoiceNumber], [mutatedDate]
```

Files:
```
SELECT [invoiceNumber]
      ,[invoicedOrganizationId]
      ,[organizationNumber]
      ,[organizationName]
      ,[invoiceBeginDate]
      ,[fileReceivedDate]
      ,[invoiceEndDate]
      ,[internalNote]
      ,[invoiceNote]
      ,[sha256]
      ,[fileName]
      ,[fileNameOutbound]
      ,[fileTypeName]
      ,[isACH]
      ,[isFedWire]
      ,[isOutboundToFed]
      ,[isInboundFromFed]
      ,[quickBalanceJSON]
      ,[isProcessed]
      ,[isRejected]
      ,[hasProcessingErrors]
      ,[originationFileCharge]
  FROM [dbo].[v_InvoiceFiles]
  Order By
  [invoiceNumber], [fileReceivedDate]
```

Export this data and provide it to Jennifer D.

How to split large files:

```
awk -v nums="726980" '
BEGIN {        
    c=split(nums,b)
    for(i=1; i<=c; i++) a[b[i]]
    j=1; out = "file_split_1.csv"
} 
{ print > out }
NR in a {
    close(out)
    out = "file_split_" ++j ".csv"
}' Results.csv
```
