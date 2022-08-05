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

function maskInfo (key, value) {
    var maskedValue = value;
    var splats = '***********************************'
    if (key == "DFIAccountNumber") 
    {
      if(value.trim() && value.trim().length > 5) {
        maskedValue = splats.substring(0,value.trim().length - 4) + maskedValue.substring(value.trim().length - 4, value.trim().length);
      } else {
        maskedValue = "****"; 
      }
    }
    return maskedValue;
}

async function main(args) {
    if (DEBUG) console.log('DEM ARGS:', args, args.length)
    if(achFiles.length == 0 & args.length == 0) throw("Error: Please pass in the path to an ACH file as an argument.")

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

    let flatArgs = args.join(' ')
    if (DEBUG) console.log('ACH_CLI:',`${achtool} ${flatArgs}`)
    const { stdout, stderr } = await exec(`${achtool} ${flatArgs}`);

    let mask = flatArgs.includes('mask')
    let json = flatArgs.includes('json')

    let Output

    if (mask && json) {
        let maskedData = JSON.stringify( JSON.parse(stdout), maskInfo, 5 );
        Output = maskedData
    } else {
        Output = stdout
    }
  
    if (stderr) {
      console.error(`error: ${stderr}`);
      throw stderr
    }

    if (cli_interactive) {
        console.log(Output)
    }

    return Output
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
