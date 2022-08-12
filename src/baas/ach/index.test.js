"use strict";

// ** mock ** 
let baas = {}
baas.ach = require('./index')

const path = require('path');
const workingDirectory = __dirname
let fileName = 'lineage_ach_test.ach'

it('baas.ach.splitReturnACH - output payments and returns file', async () => {
    await expect.assertions(2);
    // test function to parse the file to JSON
    let achJSON = await baas.ach.parseACH( path.resolve( workingDirectory, fileName ), true )

    // split the file into payments and returns
    let result = await baas.ach.splitReturnACH(achJSON, new Date(), workingDirectory);

    expect(result['payments']).toBeTruthy();
    expect(result['returns']).toBeTruthy();
});

// it('baas.ach.parsePayments - to return file name that was specified', async () => {
//     debugger;

//     await expect.assertions(2);
//     // test function to parse the file to JSON
//     let achJSON = await baas.ach.parseACH( path.resolve( workingDirectory, fileName ), true )

//     // split the file into payments and returns
//     let file_name = '0000000_0.ach'
//     let result = await baas.ach.splitReturnACH(achJSON, new Date(), workingDirectory, file_name);

//     expect( path.basename( result['payments'] )).toEqual('');
//     expect( path.basename( result['payments'] )).toEqual('');
// });
