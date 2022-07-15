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
    const EXECUTE_MOOV_WASM = false

    if(!inputfile) throw( 'baas.wire.parse() requires an inputFile!')
    // if(!inputfile) inputfile = './src/baas/wire/sample_wire_southstate.txt'
    // if(!inputfile) inputfile = './src/baas/wire/wire_fed_20220623132146_0.txt'
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

            let output = ''
            output = await globalThis.parseContents(input)
            parsedWire = JSON.parse(output); 

            return parsedWire
        } catch (moovError) {
            console.error('wire.parse() Moov FedWire Error:', 'attempted to parse the contents and they were not JSON. This task has failed us.')
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
    // check if YFT811 or {1500}
    // -- parse off the prefix
    output.hasYFT811 = false
    output.YFT811count = 0

    output.hasXFT811 = false
    output.XFT811count = 0

    // check if the wires are on a single line or multiples
    // -- parse to multiline
    output.isMultiline = false
    output.linesCount = 0

    // check if Multiple Wires in the same file.
    // -- Return an Array of parsed wires
    output.hasMultipleWires = false
    output.wiresCount = 0

    // contains an array of wires
    output.wiresJSON = []
    
    // dollar total for all wires
    output.totalCredits = 0
    output.totalDebits = 0
    output.currency = 'USD'

    // strip out the YFT811
    // new lines after each line identifier {???}
    output.reformatedFile = ''

    output.parsedFileArray = []
    
    let currentLine = 0
    let currentWireJSON = {}

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
      // process each line of the file
      for(const i in output.parsedFileArray){
        let line = output.parsedFileArray[i]
        
        if(line.includes('YFT811')) {
            output.hasYFT811 = true
            output.YFT811count = output.YFT811count + 1
            currentWireJSON.YFT811 = 'YFT811'
        }

        if(line.includes('XFT811')) {
            output.hasXFT811 = true
            output.XFT811count = output.XFT811count + 1
            currentWireJSON.XFT811 = 'XFT811'
        }

        if(line.includes('{1500}') || line.includes('{1100}}') ) {
            output.wiresCount = output.wiresCount + 1;
            if(output.wiresCount > 1) output.hasMultipleWires = true

            if(line.includes('{1500}')){
                output.wireDirection = 'OUTBOUND'
            }

            if(line.includes('{1100}')){
                output.wireDirection = 'INBOUND'
            }
        }

        // parse the file based
        let parsedWire = line.split('{')

        for( const pi in parsedWire) {
            let parsedWire2 = parsedWire[pi].split('}')

            if( parsedWire2[0].trim() == '1500' && output.hasMultipleWires && pi < 1) {
                // we detected an additional wire, write what we have
                currentWireJSON.totalCredits = parseInt(currentWireJSON["'{2000}'"]) || 0
                currentWireJSON.totalDebits = 0
                currentWireJSON.currency = 'USD'

                // running total
                output.totalCredits = output.totalCredits + currentWireJSON.totalCredits;

                output.wiresJSON.push(currentWireJSON)
                currentWireJSON = {}
            }

            if (parsedWire2[0].trim().length > 0)  currentWireJSON[`'{${parsedWire2[0].trim()}}'`] = parsedWire2[1] || ''

            if(i == output.parsedFileArray.length - 1 && pi == parsedWire.length - 1) {
                // this is the last wire at the end of the array
                currentWireJSON.totalCredits = parseInt(currentWireJSON["'{2000}'"]) || 0
                currentWireJSON.totalDebits = 0
                currentWireJSON.currency = 'USD'

                // running total
                output.totalCredits = output.totalCredits + currentWireJSON.totalCredits;

                output.wiresJSON.push(currentWireJSON)
                currentWireJSON = {}
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
    if (listDetails) {
        output = {}
        output.isFedWire = false
        output.isInbound = false
        output.isOutbound = false
        output.parsedWire = {}
    } else {
        output = false;
    }

    let parsedWireFile = await parseWireFile( inputFile )
    parsedWireFile = parsedWireFile.wiresJSON[0]
    
    let outboundWire = parsedWireFile.hasOwnProperty("'{1500}'")
    let e1500 = parsedWireFile.hasOwnProperty("'{1500}'")
    let e1510 = parsedWireFile.hasOwnProperty("'{1510}'")
    let e1520 = parsedWireFile.hasOwnProperty("'{1520}'")
    let e2000 = parsedWireFile.hasOwnProperty("'{2000}'")
    let e3100 = parsedWireFile.hasOwnProperty("'{3100}'")
    let e3400 = parsedWireFile.hasOwnProperty("'{3400}'")
    let e3600 = parsedWireFile.hasOwnProperty("'{3600}'")

    let inboundWire = parsedWireFile.hasOwnProperty("'{1100}'")
    let e1100 = parsedWireFile.hasOwnProperty("'{1100}'")
    let e1110 = parsedWireFile.hasOwnProperty("'{1110}'")
    let e1120 = parsedWireFile.hasOwnProperty("'{1120}'")

    if (listDetails) {
        // DETAILS
        if (outboundWire) {
            if(e1500 && e1510 && e1520 && e2000 && e3100 && e3400 && e3600) {
                output.isFedWire = true
                output.isInbound = false
                output.isOutbound = true
                output.parsedWire = parsedWireFile
            }
        }

        if (inboundWire){
            if(e1100 && e1110 && e1120) {
                output.isFedWire = true
                output.isInbound = true
                output.isOutbound = false
                output.parsedWire = parsedWireFile
            }
        }
    } else {
        // NO DETAILS - JUST SEND TRUE OR FALSE
        if (outboundWire) {
            if(e1500 && e1510 && e1520 && e2000 && e3100 && e3400 && e3600) output = true
        }

        if (inboundWire){
            if(e1100 && e1110 && e1120) output = true
        }
    } 

    return output
}

module.exports.parse = parse

module.exports.isFedWireCheck = isFedWireCheck


