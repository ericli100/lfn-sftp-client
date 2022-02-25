const util = require('util');
const path = require('path');
const exec = util.promisify(require('child_process').exec);

const DEBUG = false

const achFiles = process.argv.slice(2);

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason)
    process.exit(1)
});

let cli_interactive = false

if (achFiles.length >= 1) {
    cli_interactive = true
    main(achFiles)
}

async function main(args) {
    if (DEBUG) console.log('DEM ARGS:', args, args.length)
    if(achFiles.length == 0 & args.length == 0) throw("Error: Please pass in the path to an ACH file as an argument.")
    var achPath = args[0] || achFiles[0] 

    achPath = path.resolve(achPath)

    if (DEBUG) console.log('FILEPATH:', achPath)

    var achtool
    switch(process.platform){
        case 'darwin':
            achtool = path.join(process.cwd(),'src','tools','achcli')
            break;
        case 'win32':
            achtool = path.join(process.cwd(),'src','tools','achcli.exe')
            break;
        default:
            throw('Error: OS not implemented for the ACH tool.');
    }
    achtool = path.resolve(achtool)

    if (DEBUG) console.log('ACH_CLI:',`${achtool} ${achPath}`)
    const { stdout, stderr } = await exec(`${achtool} ${achPath}`);
  
    if (stderr) {
      console.error(`error: ${stderr}`);
      throw stderr
    }

    if (cli_interactive) {
        console.log(stdout)
    }

    return stdout
  }

module.exports = (args) => {
    let newArgs = []
    if (!util.isArray(args)){
        newArgs.push(args)
    } else {
        newArgs = args
    }

    return main(newArgs)
}
