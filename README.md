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


## FedWire Processing

### IMAD
<img width="566" alt="Screen Shot 2023-01-06 at 6 10 43 AM" src="https://user-images.githubusercontent.com/2130829/211011226-94fcfc65-02e1-4493-b4bd-85b1fd50837b.png">
<img width="569" alt="Screen Shot 2023-01-06 at 6 11 10 AM" src="https://user-images.githubusercontent.com/2130829/211011280-b52b370c-64b8-4656-bf21-8138b2c34847.png">

### OMAD
<img width="569" alt="Screen Shot 2023-01-06 at 6 10 17 AM" src="https://user-images.githubusercontent.com/2130829/211011315-1e8a61cc-95fa-4308-b93d-6dc3732e3a0b.png">
<img width="559" alt="Screen Shot 2023-01-06 at 6 11 25 AM" src="https://user-images.githubusercontent.com/2130829/211011337-42180e1d-9780-4fb3-adba-8c53fea9b142.png">


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

### SharePoint MS Graph

How to get the {site-id}:
https://graph.microsoft.com/v1.0/sites/lineagefn.sharepoint.com:/sites/LineageBank?$select=id

Returns:
```
{
    "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#sites(id)/$entity",
    "id": "lineagefn.sharepoint.com,7a28ea89-bac8-4244-b9f0-90ca1ac2cd24,0ba516fa-3d5d-4600-b9d7-31916a4d72bd"
}
```

How to get the {parent-id} of a folder:
https://graph.microsoft.com/v1.0/sites/lineagefn.sharepoint.com,7a28ea89-bac8-4244-b9f0-90ca1ac2cd24,0ba516fa-3d5d-4600-b9d7-31916a4d72bd/drive/root:/BaaS/Synapse/Inbound%20SFTP%20Files/prd

Note: put the URL safe path to the desired folder after the `root:` to look up the ID.

This would be the parent-id: `012NVLJIID6DZNV2EAMVFK4ANGV4XTI43E`

Returns:
```
{
    "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#sites('lineagefn.sharepoint.com%2C7a28ea89-bac8-4244-b9f0-90ca1ac2cd24%2C0ba516fa-3d5d-4600-b9d7-31916a4d72bd')/drive/root/$entity",
    "createdDateTime": "2022-10-03T19:27:54Z",
    "eTag": "\"{DAF2F003-80E8-4A65-AE01-A6AF2F347364},1\"",
    "id": "012NVLJIID6DZNV2EAMVFK4ANGV4XTI43E",
    "lastModifiedDateTime": "2022-10-03T19:27:54Z",
    "name": "prd",
    "webUrl": "https://lineagefn.sharepoint.com/sites/LineageBank/Shared%20Documents/BaaS/Synapse/Inbound%20SFTP%20Files/prd",
    "cTag": "\"c:{DAF2F003-80E8-4A65-AE01-A6AF2F347364},0\"",
    "size": 0,
    "createdBy": {
        "user": {
            "email": "brandon.hedge@lineagebank.com",
            "id": "8efd25a4-e09f-4c1b-b078-b152098712f1",
            "displayName": "Brandon Hedge"
        }
    },
    "lastModifiedBy": {
        "user": {
            "email": "brandon.hedge@lineagebank.com",
            "id": "8efd25a4-e09f-4c1b-b078-b152098712f1",
            "displayName": "Brandon Hedge"
        }
    },
    "parentReference": {
        "driveType": "documentLibrary",
        "driveId": "b!ieooesi6REK58JDKGsLNJPoWpQtdPQBGudcxkWpNcr1xTjTlRpnaSpI1XNL8nkBF",
        "id": "012NVLJIPIW7MHABUFF5GK4U5MSYBAYTIO",
        "path": "/drive/root:/BaaS/Synapse/Inbound SFTP Files"
    },
    "fileSystemInfo": {
        "createdDateTime": "2022-10-03T19:27:54Z",
        "lastModifiedDateTime": "2022-10-03T19:27:54Z"
    },
    "folder": {
        "childCount": 0
    }
}
```

The command to upload a file that is under 4MB would be:

`PUT /sites/{site-id}/drive/items/{parent-id}:/{filename}:/content`

OR

```
https://graph.microsoft.com/v1.0/sites/lineagefn.sharepoint.com,7a28ea89-bac8-4244-b9f0-90ca1ac2cd24,0ba516fa-3d5d-4600-b9d7-31916a4d72bd/drive/items/012NVLJIID6DZNV2EAMVFK4ANGV4XTI43E:/content
```
