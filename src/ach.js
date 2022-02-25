const util = require('util');
const path = require('path');
const exec = util.promisify(require('child_process').exec);

const achFiles = process.argv.slice(2);

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason)
    process.exit(1)
});

async function main(args) {
    console.log('DEM ARGS:', args, args.length)
    if(achFiles.length == 0 & args.length == 0) throw("Error: Please pass in the path to an ACH file as an argument.")
    var achPath = args[0] || achFiles[0] 
    achPath = achPath.replace('.', process.cwd())

    console.log('FILEPATH:', achPath)

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
    const { stdout, stderr } = await exec(`${achtool} ${achPath}`);
  
    if (stderr) {
      console.error(`error: ${stderr}`);
      throw stderr
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
