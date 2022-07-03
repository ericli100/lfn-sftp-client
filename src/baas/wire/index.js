"use strict";

/*
 These items are from the wasm_exec_node.js wrapper provided by Go authors.
 Moved the elements here because they intended for this file to be ran from
 the command line and not used directly within Node to expose the Go functions.
 The script as written will exit if it is NOT ran from the CLI. Ergo, we have 
 copied the necessary bits and ignored their stupid intent.
*/

globalThis.require = require;
globalThis.fs = require("fs");
globalThis.TextEncoder = require("util").TextEncoder;
globalThis.TextDecoder = require("util").TextDecoder;

globalThis.performance = {
	now() {
		const [sec, nsec] = process.hrtime();
		return sec * 1000 + nsec / 1000000;
	},
};

const crypto = require("crypto");
globalThis.crypto = {
	getRandomValues(b) {
		crypto.randomFillSync(b);
	},
};

const fs = require('fs');
const path = require('path');
const loader = require('@assemblyscript/loader')


// fetch this file from: => https://oss.moov.io/wire/wire.wasm
let wasmPath = path.resolve('./src/baas/wire/wire.wasm')
// const wasmBuffer = fs.readFileSync( wasmPath );
// WebAssembly.instantiate(wasmBuffer).then(wasmModule => {
//   // Exported function live under instance.exports
//   const { add } = wasmModule.instance.exports;
//   const sum = add(5, 6);
//   console.log(sum); // Outputs: 11
// });


const wasmBuffer = fs.readFileSync( wasmPath );

// const wasm_exec = require('./wasm_exec')
// let { readFileSync } = 'fs';

// const go = new wasm_exec.Go();


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

    // WebAssembly.instantiate(wasmBuffer).then(wasmModule => {
    //     // Exported function live under instance.exports
    //     const { parseContents } = wasmModule.instance.exports;
    //     let input = inputFile()
    //     const output = parseContents(input)
    //     console.log(output);
    // });
    
    // const wasmModule = await loader.instantiateStreaming(new Uint8Array(wasm).buffer, go.importObject);

        // WebAssembly.instantiate(wasmBuffer).then(wasmModule => {
        //   // Exported function live under instance.exports
        //   const { add } = wasmModule.instance.exports;
        //   const sum = add(5, 6);
        //   console.log(sum); // Outputs: 11
        // });

    // let moovWire = await go.run(wire);
    // const moovWire = await WebAssembly.instantiate(mod, go.importObject);
    // await go.run(moovWire.instance);
    
 ///   let input = inputFile()

  ///  let output = parseContents(input)
    // const mod = await wasm_exec.WebAssembly.compile(readFileSync('./wire.wasm'));
    // let inst = await wasm_exec.WebAssembly.instantiate(mod, go.importObject);

  ///  console.clear();
    //await go.run(inst);
   // inst = await wasm_exec.WebAssembly.instantiate(mod, go.importObject);



    //let output = parseContents(input)

    // console.log (output)
    // return output;

}

// await parse();

function inputFile() {
    let sampleWire = path.resolve('./src/baas/wire/sample_wire.txt')
    let output = fs.readFileSync( sampleWire )
    return output.toString()
}

module.exports.parse = parse


// JS
// copy
// // Assume add.wasm file exists that contains a single function adding 2 provided arguments
// const fs = require('fs');

// const wasmBuffer = fs.readFileSync('/path/to/add.wasm');
// WebAssembly.instantiate(wasmBuffer).then(wasmModule => {
//   // Exported function live under instance.exports
//   const { add } = wasmModule.instance.exports;
//   const sum = add(5, 6);
//   console.log(sum); // Outputs: 11
// });



// const json = function(input) {
//     jsonoutput.value = parseContents(input)
//     jsonoutput.setSelectionRange(0,0)
//     jsonoutput.focus()
// }

// const clearForms = function() {
//     jsoninput.value = ""
//     jsonoutput.value = ""
//     document.getElementById('input-file').value = ''
// }
// wireform.addEventListener('submit', (event) => {
//     event.preventDefault();
//     json(jsoninput.value)
// })

// document.getElementById('input-file')
//     .addEventListener('change', parseFromFile)

// function parseFromFile(event) {
//     const input = event.target
//     if ('files' in input && input.files.length > 0) {
//         placeFileContent(
//             document.getElementById('jsonoutput'),
//             input.files[0])
//     }
// }

// function placeFileContent(target, file) {
//     readFileContent(file).then(content => {
//         json(content)
//     }).catch(error => console.log(error))
// }

// function readFileContent(file) {
//     const reader = new FileReader()
//     return new Promise((resolve, reject) => {
//         reader.onload = event => resolve(event.target.result)
//         reader.onerror = error => reject(error)
//         reader.readAsText(file)
//     })
// }


