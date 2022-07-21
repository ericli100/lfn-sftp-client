'use strict';
const entityId = require('./index');
const iterations = 10;

test('Check for illegal characters in id generation.', async () => {
    for(let i = 0; i < iterations; ++i) {
        expect(entityId.generate()).toMatch(/[0-9a-f]+/);
    }
});

test('Checks for local duplicates in id generation.', async () => {
    let ids = [];
    for(let i = 0; i < iterations; ++i) {
        ids.push(entityId.generate());
    }
    let sids = [...new Set(ids)];  // Will eliminate duplicates.
    expect(ids.length).toEqual(iterations);
    expect(ids.length).toEqual(sids.length);
});

test('Checks for sequential id generation.', async () => {
    let ids = [];
    for(let i = 0; i < iterations; ++i) {
        ids.push(entityId.generate());
    }
    let sids = [...ids];
    sids.sort();
    ids.forEach(x => {
        expect(ids.indexOf(x)).toEqual(sids.indexOf(x));
    });
});