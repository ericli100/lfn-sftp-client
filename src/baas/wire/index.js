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
    require('./wasm_exec.js');
    const go = new Go();
    const importObject = go.importObject;
    const wasm = await WebAssembly.instantiate(wasmBuffer, importObject);
    go.run(wasm.instance)

    // if(!inputfile) inputfile = './src/baas/wire/sample_wire.txt'
    if(!inputfile) inputfile = './src/baas/wire/wire_fed_20220623132146_0.txt'

    let input = await inputFileToString( inputfile )

    let parsedWireInput
    try{
        parsedWireInput = await parseWireFile( inputfile )
    } catch (moovError) {
        console.error('wire.parse():', moovError)
        parsedWireInput = moovError
    }
    

    let output = ''
    
    try{
        output = await globalThis.parseContents(input)
    } catch (err) {
        console.error('wire.parse():', err)
        output = err
    }

    if(output){
        try{
            return JSON.parse(output);
        } catch (err) {
            throw('Invalid Wire File and could not parse JSON!')
        }
    } else {
        return parsedWireInput
        // throw('Invalid Wire File!')
    }

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
        }

        if(line.includes('{1500}')) {
            output.wiresCount = output.wiresCount + 1;
            if(output.wiresCount > 1) output.hasMultipleWires = true
        }

        // parse the file based
        let parsedWire = line.split('{')

        for( const pi in parsedWire) {
            let parsedWire2 = parsedWire[pi].split('}')

            if( (parsedWire2[0].trim() == '1500' || parsedWire2[0].trim() == 'YFT811' ) && output.hasMultipleWires && pi < 1) {
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

module.exports.parse = parse


