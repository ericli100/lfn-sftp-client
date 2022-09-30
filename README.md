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
git checkout tags/v1.19.3 -b v1.19.3
cd /ach/cmd/achcli
GOOS=windows GOARCH=amd64 go build -o bin/achcli-1-19-3.exe main.go diff.go reformat.go describe.go
GOOS=darwin GOARCH=amd64 go build -o bin/achcli-1-19-3 main.go diff.go reformat.go describe.go
```
1. copy these files into the `tools` directory
1. update the ach processing code to reference these new versions