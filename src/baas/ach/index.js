"use strict";
/*
    ACH module
*/

const util = require('util');
const fs = require('fs');
const path = require('path');
const exec = util.promisify(require('child_process').exec);

const { EOL } = require('os');
const readline = require('readline');
const events = require('events');
const common = require('../common')();

const split = require('./splitReturn')

const DEBUG = false

let cli_interactive = false

async function formatMoney(amount, decimalPosition = 0) {
    try{
        return await common.formatMoney({ amount: amount, decimalPosition: decimalPosition })
    } catch (error) {
        throw ( error )
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
    if(args.length == 0) throw("Error: Please pass in the path to an ACH file as an argument.")

    var achtool
    switch(process.platform){
        case 'darwin':
            achtool = path.join(process.cwd(),'src','tools','achcli-1-21-2')
            break;
        case 'win32':
            achtool = path.join(process.cwd(),'src','tools','achcli-1-21-2.exe')
            break;
        default:
            throw('Error: OS not implemented for the ACH tool.');
    }
    achtool = path.resolve(achtool)

    let flatArgs = args.join(' ')
    if (DEBUG) console.log('ACH_CLI:',`${achtool} ${flatArgs}`)

    try{
        const { stdout, stderr } = await exec(`${achtool} ${flatArgs}`, {maxBuffer: undefined});

        let mask = flatArgs.includes('mask')
        let json = flatArgs.includes('json')
    
        let output
    
        if (mask && json) {
            let maskedData = JSON.parse( JSON.stringify( JSON.parse(stdout), maskInfo, 5 ) );
            output = maskedData
        } else {
            output = JSON.parse( stdout );
        }
      
        if (stderr) {
          console.error(`error: ${stderr}${stdout}`);
          throw stderr
        }
    
        if (cli_interactive) {
            console.log(output)
        }

        return output
    } catch (err) {
        console.debug('ACHCLI Error:', err)
        throw(err)
    }
}

async function isACH(args){
    // parse the entire file an check if it is valid JSON to determine if it is an ACH file.
    try{
        let achJSON = await main(args)
        let isJSON = await isValidJSON( achJSON )
        return isJSON
    } catch (error) {
        console.error('ACH PARSE ERROR:' + error)
        return false
    }
}

async function getHeader( achJSON ) {

}

async function getBatch( achJSON ) {

}

async function getTransactions( achBatch ) {

}

async function getFooter( achJSON ) {
    
}

async function isValidJSON( data ) {
    let checkJSON = {}

    if (typeof data == 'object') return true

    try {
        checkJSON = JSON.parse( data) ;
        return true
    } catch (e) {
        return false
    }
}

async function achAdvice({ vendor, environment, filename, isOutbound, short }){
    let ach_data = await main( [`-reformat json`, `-mask`, `"${filename}"`] )

    let isJSON = await isValidJSON( ach_data )
    let achJSON = {}

    if(isJSON) {
        if(typeof ach_data == 'string') {
            achJSON = JSON.parse(ach_data);
        }

        if(typeof ach_data == 'object') {
            achJSON = ach_data
        }
    } else {
        console.error("Parsing the ACH JSON failed. Check the output.");
        throw ("Error Parsing the ACH JSON failed. Check the output.")
    }

    if(DEBUG) console.log( ach_data )

    let direction = "INBOUND"

    if (isOutbound) {direction = "OUTBOUND"}

    let messageBody = `******************************************************************************\n`
    messageBody += `  ${vendor.toUpperCase()}:${environment.toUpperCase()} - BaaS: ${direction} FedACH Advice - Notification\n`
    messageBody += `******************************************************************************\n`

    messageBody += `\n\n`
    messageBody += `Vendor: ${vendor}\n`
    messageBody += `Environment: ${environment}\n`
    messageBody += `Filename: ` + path.basename( filename ) + '\n';
    messageBody += `BaaS Processor Version: 2.0 \n`;
    messageBody += `\n\n`

    if (isJSON) {
        let spacing = "   "
        messageBody += `******** ACH Batch Details ********\n`
        messageBody += `\n`
        messageBody += spacing + `Total File Control: [Immediate Origin:(${achJSON.fileHeader.immediateOriginName})]: \n`
        messageBody += spacing + spacing + `Total Debit: ${await formatMoney(achJSON.fileControl.totalDebit, 2)} \n`// achJSON.fileControl
        messageBody += spacing + spacing + `Total Credit: ${await formatMoney("-" + achJSON.fileControl.totalCredit, 2) } \n`
        messageBody += spacing + spacing + `fileCreationDate: ${achJSON.fileHeader.fileCreationDate} `
        messageBody += '\n\n'

        if(ach_data.ReturnEntries){
            if(ach_data.ReturnEntries.length > 0){
                // we have returns in this file
                messageBody += `  ******** ACH Returns ********\n`
                messageBody += `  \n`

                for( let achReturnBatch of ach_data.ReturnEntries) {
                    messageBody += spacing + `  Return Batch[${achReturnBatch.batchHeader.companyName}(${achReturnBatch.batchHeader.batchNumber})]: \n`
                    messageBody += spacing + spacing + `  Return Debit: ${await formatMoney(achReturnBatch.batchControl.totalDebit, 2)} \n`// achJSON.fileControl
                    messageBody += spacing + spacing + `  Return Credit: ${await formatMoney("-" + achReturnBatch.batchControl.totalCredit, 2) } \n`
                }

                messageBody += `  ******** ACH Returns End *****\n`
            }
        }
        
        let batchTotals = await parseBatchACH(achJSON, spacing)
        messageBody += batchTotals

        messageBody += `******** ACH Batch Details End ****\n`
       messageBody += `\n\n`
    }

    messageBody += `ACH FILE DETAILS:\n`

    if(!short) {
        if(typeof ach_data == 'string') {
            messageBody += ach_data
        }
    
        if(typeof ach_data == 'object') {
            messageBody += JSON.stringify( ach_data )
        }
    
        messageBody += `\n\n`
    }

    if(short) {
        messageBody += '** NOTICE **\n'
        messageBody += '** The JSON Body was too large to include in the body of this message. ** \n'
    }

    return messageBody
}

async function achAdviceOverride({ vendor, environment, filename, isOutbound }){
    let achJSON = await parseAchFile( filename )
    let direction = "INBOUND"

    if (isOutbound) {direction = "OUTBOUND"}

    let messageBody = `******************************************************************************\n`
    messageBody += `  ${vendor.toUpperCase()}:${environment.toUpperCase()} - BaaS: ${direction} FedACH Advice - Notification\n`
    messageBody += ` ** WARNING - PROCESSED WITH THE MANUAL OVERRIDE FLAG!!! \n`
    messageBody += ` ** FALLING BACK TO THE QUICK PARSER !!                    \n`
    messageBody += ` ** FILE DID NOT PASS THE NACHA SPEC VALIDATION - FILE MAY HAVE ERRORS ON [FEDACH] !! \n`
    messageBody += `******************************************************************************\n`

    messageBody += `\n\n`
    messageBody += `Vendor: ${vendor}\n`
    messageBody += `Environment: ${environment}\n`
    messageBody += `Filename: ` + path.basename( filename ) + '\n';
    messageBody += `Manual Override: TRUE\n`;
    messageBody += `Failed Moov.ACH Parsing: TRUE\n`;
    messageBody += `\n\n`

 
    let spacing = "   "
    messageBody += `******** ACH Quick Parse Details ********\n`
    messageBody += `\n`
    messageBody += spacing + `Total Debits: ${await formatMoney( achJSON.totalDebits, 2)} \n`// achJSON.fileControl
    messageBody += spacing + `Total Credits: ${await formatMoney("-" + achJSON.totalCredits, 2) } \n`
    messageBody += '\n\n'


    messageBody += `******** ACH Quick Parse End ****\n`
    messageBody += `\n\n`
    

    messageBody += `ACH [QUICK PARSE] FILE DETAILS:\n`
    messageBody += JSON.stringify(achJSON, null, ' ')
    messageBody += `\n\n`

    return messageBody
}

async function parseBatchACH(achJSON, spacing) {
    let output = ""
    let batchArray = achJSON.batches 

    if (batchArray) {
        for (const batch of batchArray) {
            if(DEBUG) console.log(batch)
            output += spacing + 'Batch Number: (' + batch.batchHeader.batchNumber + `) [ ${batch.batchHeader.companyName} (${batch.batchHeader.companyEntryDescription}) ] `
            output += '- Effective Date: ' + batch.batchHeader.effectiveEntryDate + '\n' 
            output += spacing + spacing + spacing + `Batch(${batch.batchHeader.batchNumber}) Debit: ` + await formatMoney(batch.batchControl.totalDebit, 2) + '\n' 
            output += spacing + spacing + spacing + `Batch(${batch.batchHeader.batchNumber}) Credit: ` + await formatMoney('-' + batch.batchControl.totalCredit, 2) + '\n' 
            output += '\n'
        }
    }

    let iatBatchArray = achJSON.IATBatches

    if (iatBatchArray) {
        output += spacing + '** IAT BATCH ***************** \n\n'
        for (const batch of iatBatchArray) {
            if(DEBUG) console.log(batch)
            output += spacing + 'IAT Batch Number: (' + batch.IATBatchHeader.batchNumber + `) [ ${batch.IATBatchHeader.originatorIdentification} (${batch.IATBatchHeader.companyEntryDescription}) ] `
            output += '- Effective Date: ' + batch.IATBatchHeader.effectiveEntryDate + '\n' 
            output += spacing + spacing + spacing + `IAT Batch(${batch.IATBatchHeader.batchNumber}) Debit: ` + await formatMoney(batch.batchControl.totalDebit, 2) + '\n' 
            output += spacing + spacing + spacing + `IAT Batch(${batch.IATBatchHeader.batchNumber}) Credit: ` + await formatMoney('-' + batch.batchControl.totalCredit, 2) + '\n' 
            output += '\n'
        }
    }

    return output
}

async function parseAchFile( inputfile ){
    if(!inputfile) throw( 'baas.ach.parseAchFile() requires an inputFile!')
    let output = {}

    output.totalLines = 0

    // dollar total for all ach files
    output.totalCredits = 0
    output.totalDebits = 0
    output.currency = 'USD'

    output.achJSON = []

    let currentLine = 0
    let currentAchJSON = {}

    output.parsedFileArray = []

    try {
        const rl = readline.createInterface({
          input: fs.createReadStream( inputfile ),
          crlfDelay: Infinity
        });
    
        rl.on('line', (line) => {
          currentLine++
          output.totalLines = currentLine;
  
          // it will be easier to deal with an array versus reacting to events
          output.parsedFileArray.push(line);
        });
    
        await events.once(rl, 'close');
  
        // let's work with the array that was just processed:
        // last line of the ACH file should be the control file
        for(const i in output.parsedFileArray){
            let line = output.parsedFileArray[i]

            /*
                101… File Header Record
                520… Batch Header Record
                627… Entry Detail Record
                637… Entry Detail Record
                7XX… Addenda Record
                . . . . . .
                820… Batch Control Record
                520… Batch Header Record
                622… Entry Detail Record
                7XX… Addenda Record
                622… Entry Detail Record
                . . . . . .
                820… Batch Control Record
                . . . . . .
                900… File Control Record
                999… File Padding
            */


            // 101… File Header Record
            if(line.substring(0,3) == '101') {
                currentAchJSON['101'] = {lineNumber: i, type:'File Header Record', line: line.substring(0,line.length), values: [] }
            }

            // 900… File Control Record
            if(line.substring(0,3) == '900') {
                /*
                    NAME                                     | Position | Length | 
                    Total Debit Entry Dollar Amount in File  | 32-43    | 12     |
                    Total Credit Entry Dollar Amount in File | 44-55    | 12     |
                */
                currentAchJSON['900'] = {lineNumber: i, type:'File Control Record', line: line.substring(0,line.length), entryAdendaCount: parseInt(line.substring(13, 21)) }

                output.totalDebits = parseInt( line.substring(31,43) )
                output.totalCredits = parseInt( line.substring(43,55) )

                // "fileControl": {
                //     "batchCount": 2,
                //     "blockCount": 10,
                //     "entryAddendaCount": 94,
                //     "entryHash": 226866882,
                //     "id": "",
                //     "totalCredit": 3592500,
                //     "totalDebit": 3592000
                //   }
            }

            if( i == output.parsedFileArray.length - 1 ) {
                // this is the last line of the array
                output.achJSON.push(currentAchJSON)
                currentAchJSON = {}
            }
        }
      } catch (err) {
        console.error(err);
        throw(err)
      }

    return output
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

module.exports.parseACH = (filename, unmasked) => {
    if (unmasked) {
        return main([`-reformat json`, `"${filename}"`])
    } else {
        return main([`-reformat json`, `-mask`, `"${filename}"`])
    }
    
}

module.exports.achAdvice = achAdvice

module.exports.achAdviceOverride = achAdviceOverride 

module.exports.formatMoney = (amount, decimalCount) => {
    return formatMoney(amount, decimalCount)
}

module.exports.isACH = (filename) => {
    return isACH([`-reformat json`, `-mask`, `"${filename}"`])
}

module.exports.parse = parseAchFile

module.exports.splitReturnACH = split.split_from_json
