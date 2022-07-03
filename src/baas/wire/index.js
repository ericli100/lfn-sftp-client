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

// fetch this file from: => https://oss.moov.io/wire/wire.wasm
let wasmPath = path.resolve('./src/baas/wire/wire.wasm')
const wasmBuffer = fs.readFileSync( wasmPath );

async function parse () {
    require('./wasm_exec.js');
    const go = new Go();
    const importObject = go.importObject;
    const wasm = await WebAssembly.instantiate(wasmBuffer, importObject);
    //const { parseContents } = wasm.instance.exports;
   
    go.run(wasm.instance)
    //const { parseContents } = wasm.instance.exports;
  //  let wasmModule = await WebAssembly.instantiate(wasm);

   //  await WebAssembly.instantiate(wasm, go.importObject);
    let input = inputFile()
    let output = parseContents(input)

    if(output){
        try{
            return JSON.parse(output);
        } catch (err) {
            throw('Invalid Wire File and could not parse JSON!')
        }
    } else {
        throw('Invalid Wire File!')
    }

}

function inputFile() {
    let sampleWire = path.resolve('./src/baas/wire/sample_wire.txt')
    let output = fs.readFileSync( sampleWire )
    return output.toString()
}


function checkFileType(){
    // check if YFT811 or {1500}
    // -- parse off the prefix

    // check if the wires are on a single line or multiples
    // -- parse to multiline

    // check if Multiple Wires in the same file.
    // -- Return an Array of parsed wires
}

module.exports.parse = parse


