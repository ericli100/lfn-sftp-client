"use strict";

/*
 These items are from the wasm_exec_node.js wrapper provided by Go authors.
 Moved the elements here because they intended for this file to be ran from
 the command line and not used directly within Node to expose the Go functions.
 The script as written will exit if it is NOT ran from the CLI. Ergo, we have 
 copied the necessary bits and ignored their stupid intent.
*/

const fs = require('fs');
const path = require('path');
const { EOL } = require('os');
const readline = require('readline');
const events = require('events');

// fetch this file from: => https://oss.moov.io/wire/wire.wasm
let wasmPath = path.resolve('./src/baas/wire/wire.wasm')
const wasmBuffer = fs.readFileSync( wasmPath );

async function parse ( inputfile ) {
    const EXECUTE_MOOV_WASM = true

    if(!inputfile) inputfile = './src/baas/wire/wire_fed_20220623132146_0.txt'
    // if(!inputfile) inputfile = './src/baas/wire/sample_wire.txt'

    let input = await inputFileToString( inputfile )
    let parsedWire
    
    if (EXECUTE_MOOV_WASM) {
        try{
            require('./wasm_exec.js');
            const go = new Go();
            const importObject = go.importObject;
            const wasm = await WebAssembly.instantiate(wasmBuffer, importObject);
            go.run(wasm.instance)

            let output = {}
            output.isOutbound = false
            output.isInbound = false

            output.wires = []
            input = input.split('{')

            let parsed = ''
            let linenumber = 0
            for(let line of input){
                let skipLine = false
                linenumber ++
                let spaces = '                                                                                                    '
                spaces += '                                                                                                   ';

                let newline

                if(line.indexOf('YFT811') >=0 && linenumber <= 2) {
                    skipLine = true
                }

                if(line.indexOf('XFT811') >= 0 && linenumber <= 2) {
                    skipLine = true
                }

                if(line.indexOf('FFT811') >= 0 && linenumber <= 2) {
                    skipLine = true
                    output.isFedAck = true
                }

                if(line.indexOf('(FEDERAL RESERVE)�') >= 0 && linenumber <= 2) {
                    skipLine = true
                }

                if(line.indexOf('(FEDERAL RESERVE)') >= 0 && linenumber <= 2) {
                    skipLine = true
                }

                if(line.indexOf('1500}') == 0) {
                    // OUTBOUND WIRE -- 
                    output.isOutbound = true
                    output.isInbound = false

                    // check for UserRequestCorrelation
                    let userRequestCorrelation = line.substring(7, 15).trim()
                    if(userRequestCorrelation.length == 0) {
                        // just set one for parsing
                        line = line.replace(' T', '0T')
                        line = line.replace(' P', '0P')
                    }
                }

                if(line.indexOf('1100}') == 0) {
                    // INBOUND WIRE -- 
                    output.isOutbound = false
                    output.isInbound = true

                    output.e1100 = '{' + line

                    skipLine = true
                }

                if(line.indexOf('1110}') == 0) {
                    // INBOUND WIRE -- 
                    output.e1110 = '{' + line
                    skipLine = true
                }

                if(line.indexOf('1120}') == 0) {
                    // INBOUND WIRE -- 
                    output.e1120 = '{' + line
                    skipLine = true
                }
                
                if(line.indexOf('3320}') == 0) {
                    // INBOUND WIRE -- 
                    newline = line + spaces
                    newline = newline.substring(0, 21)
                }

                if(line.indexOf('3710}') == 0) {
                    // INBOUND WIRE -- 
                    newline = line + spaces
                    newline = newline.substring(0, 23)

                    output.isExchangeRate = true
                    output.e3710 = '{' + line

                    skipLine = true
                }

                if(line.indexOf('3720}') == 0) {
                    // INBOUND WIRE -- 
                    newline = line + spaces
                    newline = newline.substring(0, 17)

                    output.isExchangeRate = true
                    output.e3720 = '{' + line

                    skipLine = true
                }
                
                if(line.indexOf('4100}') == 0) {
                    // INBOUND WIRE -- 
                    newline = line + spaces
                    newline = newline.substring(0, 180)
                }
                
                if(line.indexOf('4320}') == 0) {
                    // INBOUND WIRE -- 
                    newline = line + spaces
                    newline = newline.substring(0, 21)
                }

                if(line.indexOf('3100}') == 0) {
                    newline = line + spaces
                    newline = newline.substring(0, 32)
                }

                if(line.indexOf('3400}') == 0) {
                    newline = line + spaces
                    newline = newline.substring(0, 32)
                }

                if(line.indexOf('3600}') == 0) {
                    newline = line + spaces
                    newline = newline.substring(0, 11)
                }

                if(line.indexOf('4200}') == 0) {
                    newline = line + spaces
                    newline = newline.substring(0, 180)
                }

                if(line.indexOf('5000}') == 0) {
                    newline = line + spaces
                    newline = newline.substring(0, 180)
                }

                if(line.indexOf('5100}') == 0) {
                    newline = line + spaces
                    newline = newline.substring(0, 180)
                }

                if(output.isOutbound) {
                    if(line.indexOf('6000}') == 0) {
                        newline = line + spaces
                        newline = newline.substring(0, 145)
                    }
                }

                if(output.isInbound) {
                    if(line.indexOf('6000}') == 0) {
                        newline = line + spaces
                        newline = newline.substring(0, 146)
                    }
                }

                if(line.indexOf('6100}') == 0) {
                    newline = line + spaces
                    newline = newline.substring(0, 200)
                }

                if(!skipLine) {
                    let writeLine = newline || line

                    writeLine = writeLine.replace('\n', '')
                    writeLine = writeLine.replace('\r\n', '')

                    if (line.length > 0) parsed += '{' + writeLine + '\r\n'
                }
            }
            
            try{
                output.rawParsed = parsed
                let wire = await globalThis.parseContents(parsed)
                wire = JSON.parse(wire); 
                wire = wire.fedWireMessage;

                output.wires.push( wire )
                output.totalAmount = parseInt(wire.amount.amount)

                return output

            } catch (parseError) {
                output.hasError = true
                output.parseError = parseError
            }

        } catch (moovError) {
            console.error('wire.parse() Moov FedWire Error:', 'attempted to parse the contents and they were not JSON. This task has failed us.')
            // keep processing and try a quick parse below
        }
    }

    try{
        parsedWire = await parseWireFile( inputfile )
        return parsedWire
    } catch (err){
        console.error('wire.parse() parseWireFile Error:', err)
    }

    return 
}

async function inputFileToString ( inputfile ) {
    let sampleWire = path.resolve( inputfile )
    let output = fs.readFileSync( sampleWire )
    return output.toString()
}

async function parseWireFile( inputfile ) {

    let output = {}
    output.wires = [];
    output.parsedFileArray = []

    // ** allow for parsing multiple wires from the same file **
    let currentParsedWire = {}
    let currentLine = 0
    let currentWireJSON = {}

    // check if Multiple Wires in the same file.
    // -- Return an Array of parsed wires
    output.hasMultipleWires = false
    output.wiresCount = 0

    output.totalAmount = 0

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

      currentParsedWire.hasYFT811 = false
      currentParsedWire.YFT811count = 0

      currentParsedWire.hasXFT811 = false
      currentParsedWire.XFT811count = 0

      // check if the wires are on a single line or multiples
      // -- parse to multiline
      output.isMultiline = false
      currentParsedWire.linesCount = 0

      // contains an array of wires
      currentParsedWire.wiresJSON = []
      
      // dollar total for all wires
      currentParsedWire.totalAmount = 0
      currentParsedWire.currency = 'USD'

      // strip out the YFT811
      // new lines after each line identifier {???}
      currentParsedWire.reformatedFile = ''


      // let's work with the array that was just processed:
      // process each line of the file
      for(const i in output.parsedFileArray){
    
        
        // ********************************
        // ** PARSE THE LINE **************
        // ********************************
        let line = output.parsedFileArray[i]
        
        if(line.includes('YFT811')) {
            currentParsedWire.hasYFT811 = true
            currentParsedWire.YFT811count = currentParsedWire.YFT811count + 1
            currentWireJSON.YFT811 = 'YFT811'
        }

        if(line.includes('XFT811')) {
            currentParsedWire.hasXFT811 = true
            currentParsedWire.XFT811count = currentParsedWire.XFT811count + 1
            currentWireJSON.XFT811 = 'XFT811'
        }

        if(line.includes('{1500}') || line.includes('{1100}') ) {
            output.wiresCount = output.wiresCount + 1;
            if(output.wiresCount > 1) output.hasMultipleWires = true

            if(line.includes('{1500}')){
                currentParsedWire.wireDirection = 'OUTBOUND'
            }

            if(line.includes('{1100}')){
                currentParsedWire.wireDirection = 'INBOUND'
            }
        }

        // parse the file based
        let parsedWire = line.split('{')

        for( const pi in parsedWire) {
            let parsedWire2 = parsedWire[pi].split('}')

            // we found a wire file
            if( parsedWire2[0].trim() == '1500' && output.hasMultipleWires && pi < 1) {
                // we detected an additional wire, write what we have
                currentWireJSON.totalAmount = parseInt(currentWireJSON["'{2000}'"]) || 0
                currentWireJSON.currency = 'USD'

                // running total
                currentParsedWire.totalCredits = output.totalAmount + currentWireJSON.totalAmount;

                output.wires.push(currentWireJSON)
                currentWireJSON = {}
            }

            // populate the current key in currentWireJSON
            if (parsedWire2[0].trim().length > 0)  currentWireJSON[`'{${parsedWire2[0].trim()}}'`] = parsedWire2[1] || ''

            // single wire file - set the initial total to zero
            if (currentWireJSON.hasOwnProperty("'{2000}'") && !currentWireJSON.totalAmount && output.hasMultipleWires == false) {
                currentWireJSON.totalAmount = 0
            }

            // multiple wires - pull total
            if((pi == parsedWire.length - 1 && output.hasMultipleWires)) {
                // this is the end of the current wire being parsed
                currentWireJSON.totalAmount = parseInt(currentWireJSON["'{2000}'"]) || 0
                currentWireJSON.currency = 'USD'

                // running total
                output.totalAmount = output.totalAmount + currentWireJSON.totalAmount;

                output.wires.push(currentWireJSON)
                currentWireJSON = {}
                currentWireJSON.totalAmount == 0
            }

            // first multiwire or single wire in file - pull amount
            if(pi == parsedWire.length - 1 && output.hasMultipleWires == false && currentWireJSON.hasOwnProperty("'{2000}'") && (currentWireJSON.totalAmount == 0 || !currentWireJSON.totalAmount) ) {
                // this is the end of the current wire being parsed
                currentWireJSON.totalAmount = parseInt(currentWireJSON["'{2000}'"]) || 0
                currentWireJSON.currency = 'USD'

                // running total
                output.totalAmount = output.totalAmount + currentWireJSON.totalAmount;

                if(pi == parsedWire.length - 1 && line.lastIndexOf('}') >= 20){
                    // supposed to be for a multifile ONLY
                    output.wires.push(currentWireJSON)
                    currentWireJSON = {}
                    currentWireJSON.totalAmount == 0
                }
            }

            // single wire in file - last line
            if( output.hasMultipleWires == false && i == output.parsedFileArray.length - 1 && pi == parsedWire.length - 1 && Object.keys(currentWireJSON).length > 5){
                output.wires.push(currentWireJSON)
                currentWireJSON = {}
                currentWireJSON.totalAmount == 0
            }
        }
      }

    } catch (err) {
      console.error(err);
      throw(err)
    }
    
    return output
}

async function isFedWireCheck( { inputFile, listDetails } ) {
    if (!inputFile) throw('baas.wire.isFedWireCheck requires an inputFile')

    let output
    
    let parsedWireFile = await parseWireFile( inputFile )
    let allWiresAreValid = true

    if (listDetails) {
        output = {}
        output.isFedWire = false
        output.hasMultipleWires = parsedWireFile.hasMultipleWires
        output.wiresCount = parsedWireFile.wiresCount
        output.totalAmount = parseInt(parsedWireFile.totalAmount)

        output.wires = []
    } else {
        output = false;
    }

    for(let wire of parsedWireFile.wires) {
        let currentOutput = {}
        currentOutput.isFedWire = false
        currentOutput.isInbound = false
        currentOutput.isOutbound = false

        let outboundWire = wire.hasOwnProperty("'{1500}'")
        let e1500 = wire.hasOwnProperty("'{1500}'")
        let e1510 = wire.hasOwnProperty("'{1510}'")
        let e1520 = wire.hasOwnProperty("'{1520}'")
        let e2000 = wire.hasOwnProperty("'{2000}'")
        let e3100 = wire.hasOwnProperty("'{3100}'")
        let e3400 = wire.hasOwnProperty("'{3400}'")
        let e3600 = wire.hasOwnProperty("'{3600}'")
    
        let inboundWire = wire.hasOwnProperty("'{1100}'")
        let e1100 = wire.hasOwnProperty("'{1100}'")
        let e1110 = wire.hasOwnProperty("'{1110}'")
        let e1120 = wire.hasOwnProperty("'{1120}'")

        if (listDetails) {
            // DETAILS
            if (outboundWire) {
                if(e1500 && e1510 && e1520 && e2000 && e3100 && e3400 && e3600) {
                    currentOutput.isFedWire = true
                    currentOutput.isInbound = false
                    currentOutput.isOutbound = true
                    currentOutput.wire = wire
                    output.wires.push(currentOutput)
                } else {
                    // only set it to false if it is true, let it remain false if any wire check fails
                    if (allWiresAreValid) allWiresAreValid = false
                }
            }
    
            if (inboundWire){
                if(e1100 && e1110 && e1120) {
                    currentOutput.isFedWire = true
                    currentOutput.isInbound = true
                    currentOutput.isOutbound = false
                    currentOutput.wire = wire
                    output.wires.push(currentOutput)
                } else {
                    // only set it to false if it is true, let it remain false if any wire check fails
                    if (allWiresAreValid) allWiresAreValid = false
                }
            }
        } else {
            // NO DETAILS - JUST SEND TRUE OR FALSE
            if (outboundWire) {
                if(e1500 && e1510 && e1520 && e2000 && e3100 && e3400 && e3600) {
                    output = true
                } else {
                    // we hit a bad one... return false
                    return false
                }

            }
    
            if (inboundWire){
                if(e1100 && e1110 && e1120) {
                    output = true
                } else {
                    // we hit a bad one... return false
                    return false
                }
            }
        } 
    }
    //parsedWireFile = parsedWireFile.wiresJSON[0]
    
    if(listDetails) output.isFedWire = allWiresAreValid

    return output
}

async function wireAdvice( { vendor, environment, inputFile, isOutbound, listDetails } ){
    let wireJSON = await isFedWireCheck( { inputFile, listDetails: true } )

    let direction = "INBOUND"
    if (isOutbound) {direction = "OUTBOUND"}

    let messageBody = `******************************************************************************\n`
    messageBody += `  ${vendor.toUpperCase()}:${environment.toUpperCase()} - BaaS: ${direction} FedWire Advice - Notification\n`
    messageBody += `******************************************************************************\n`
    messageBody += `\n\n`
    messageBody += `Vendor: ${vendor}\n`
    messageBody += `Environment: ${environment}\n`
    messageBody += `Filename: ` + path.basename( inputFile ) + '\n'
    messageBody += `Total Wires in File: [${wireJSON.wiresCount}] \n`
    messageBody += `Total Amount: ${formatMoney(wireJSON.totalAmount, 2)} \n`//
    messageBody += `\n\n`

    let spacing = "   "
    messageBody += `*****************************************************\n`
    messageBody += `******** FedWire Summary ****************************\n`
    messageBody += `\n`

    let currentWireNumber = 0
    for(let eachWire of wireJSON.wires) {
        currentWireNumber++
        messageBody += spacing + `FedWire Number [${currentWireNumber}] **************************: \n`
        messageBody += spacing + spacing + `Wire Type: ${eachWire.wire["'{3600}'"]}${eachWire.wire["'{1510}'"]} \n`
        messageBody += spacing + spacing + `Wire Amount: ${formatMoney( parseInt( eachWire.wire["'{2000}'"] ), 2)} \n`//
        if( eachWire.wire.hasOwnProperty("'{1520}'") ) messageBody += spacing + spacing + `Wire Date and Sender {1520}: ${eachWire.wire["'{1520}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{3400}'") ) messageBody += spacing + spacing + `Sender Bank {3400}: ${eachWire.wire["'{3400}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{3100}'") ) messageBody += spacing + spacing + `Receiving Bank {3100}: ${eachWire.wire["'{3100}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{5000}'") ) messageBody += spacing + spacing + `Originator Name {5000}: ${eachWire.wire["'{5000}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{4200}'") ) messageBody += spacing + spacing + `Beneficiary Name {4200}: ${eachWire.wire["'{4200}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{1520}'") ) messageBody += spacing + spacing + `IMAD {1520}: ${eachWire.wire["'{1520}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{1120}'") ) messageBody += spacing + spacing + `OMAD {1120}: ${eachWire.wire["'{1120}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{8200}'") )  messageBody += spacing + spacing + `Adenda {8200}: ${eachWire.wire["'{8200}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{6000}'") )  messageBody += spacing + spacing + `Note {6000}: ${eachWire.wire["'{6000}'"]} \n`
        if( eachWire.wire.hasOwnProperty("'{6100}'") )  messageBody += spacing + spacing + `Note {6100}: ${eachWire.wire["'{6100}'"]} \n`
        messageBody += spacing + `End FedWire Number [${currentWireNumber}] ********************** `
        messageBody += '\n\n' 
    }

    messageBody += `******** FedWire Summary End ************************\n`
    messageBody += `*****************************************************\n`
    messageBody += `\n\n`

    if(listDetails) {
        messageBody += `FEDWIRE FILE DETAILS:\n`
        messageBody += JSON.stringify(wireJSON, null, 2)
        messageBody += `\n\n`
    }

    return messageBody
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
             if(DEBUG) console.log('Amount:',Original,"Output:", '$' + n + a + '.' + c)
         return '$' + n + a + '.' + c
 
     } catch (e) {
        if(DEBUG) console.log(e)
       throw e
     }
 };

module.exports.parse = parse

module.exports.isFedWireCheck = isFedWireCheck

module.exports.wireAdvice = wireAdvice


