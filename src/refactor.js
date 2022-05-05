'use strict';

require('dotenv').config({ path: __dirname + '/.env' })

async function main(){
    let args = {};
    let baas = require('./baas')(args)
    console.log('sql:', baas)
}

main()