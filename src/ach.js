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

function formatMoney(amount, decimalPosition = 0) {
    let Original = amount

    if (amount === null) return;
    if(typeof amount !== 'string') { amount = amount.toString() }
 
    try {
         let a = '';
         let c = '';
         let n = '';
         if(amount.indexOf('-')==0){
            n = '-'
            amount = amount.substring(1, amount.length)
            if(amount.length <= decimalPosition) {
                amount = '00' + amount
            }

            if(amount == '000') { n = ''}
         }

         if(amount.indexOf('(')==0 && amount.indexOf(')')> 0){
            n = '-'
            amount = amount.substring(1, amount.length)
            amount = amount.substring(0, amount.length -1)
            if(amount.length <= decimalPosition) {
                amount = '00' + amount
            }
         }

         if(amount.indexOf('.')>0){
             a = amount.substring(0, amount.length - 3)
             c = amount.substring( amount.indexOf('.') + 1 , amount.length);
         } else if (decimalPosition > 0) {
            if(amount.length <= decimalPosition) {
                amount = '00' + amount
            }
             a = amount.substring(0, amount.length - decimalPosition)
             c = amount.substring(amount.length - decimalPosition, amount.length)
         } else {
            if(amount.length <= decimalPosition) {
                amount = '00' + amount
            }
             a = amount
             c = '00'
         }
 
         a = a
             .toString() // transform the number to string
             .split("") // transform the string to array with every digit becoming an element in the array
             .reverse() // reverse the array so that we can start process the number from the least digit
             .map((digit, index) =>
                 index != 0 && index % 3 === 0 ? `${digit},` : digit
             ) // map every digit from the array.
             // If the index is a multiple of 3 and it's not the least digit,
             // that is the place we insert the comma behind.
             .reverse() // reverse back the array so that the digits are sorted in correctly display order
             .join(""); // transform the array back to the string
         console.log('Amount:',Original,"Output:", '$' + n + a + '.' + c)
         return '$' + n + a + '.' + c
 
     } catch (e) {
       console.log(e)
       throw e
     }
 };

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

module.exports.formatMoney = (amount, decimalCount) => {
    return formatMoney(amount, decimalCount)
}
