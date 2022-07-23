'use strict';

const intformat = require('biguint-format');
const FlakeId = require('flake-idgen');

const fidc = process.env.FLAKEID_DATACENTER;
const fiw = process.env.FLAKEID_WORKER;

const datacenter = fidc && !isNaN(Number.parseInt(fidc)) ? Number.parseInt(fidc) : 0;
const worker = fiw && !isNaN(Number.parseInt(fiw)) ? Number.parseInt(fiw) : 0;

const flakeId = new FlakeId({ datacenter, worker });

function generate() {
    return intformat(flakeId.next(), 'hex');
}

module.exports = { generate };