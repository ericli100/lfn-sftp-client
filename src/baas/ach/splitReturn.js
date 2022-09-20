'use strict';

/* LIBRARIES */
const axios = require('axios').default;
const fs = require('fs');
var path = require('path');

/* DEBUG */
const DEBUG = true
let debug_input_file = function (file_stream) {
    function streamToString(stream) {
        const chunks = [];
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on('error', (err) => reject(err));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        })
    }
    streamToString(file_stream).then(result => { console.log(result) })
}

/* UTILS */
let get_addendas = function (entry_json) {
    return Object.keys(entry_json).filter((key) => {
        return key.indexOf('addenda') !== -1 && key !== 'addendaRecordIndicator'
    });
}
let get_settlement_direction = function (entry_json) {
    let is_return = is_entry_return(entry_json);

    return ({
        'payment':
        {
            '22': 'credit', '23': 'credit', '24': 'credit', '32': 'credit', '33': 'credit', '34': 'credit', '42': 'credit', '52': 'credit',
            '27': 'debit', '28': 'debit', '29': 'debit', '37': 'debit', '38': 'debit', '39': 'debit', '47': 'debit', '55': 'debit'
        },
        'return':
        {
            '21': 'credit', '31': 'credit', '41': 'credit', '51': 'credit',
            '26': 'debit', '36': 'debit', '46': 'debit', '56': 'debit'
        }
    })[is_return ? 'return' : 'payment'][entry_json['transactionCode']]
}
let is_entry_return = function (entry_json) {
    let addendas = get_addendas(entry_json);
    if (addendas.length === 0) { return false }

    for (let x = 0; x < addendas.length; x++) {
        let addenda_content = entry_json[addendas[x]];
        if (addenda_content['returnCode'] || addenda_content['changeCode']) { return true }
    }

    return false
}
let render_dynamic_length = function (value, max_length) {
    if (!value) value = '';
    while (value.length < max_length) { value += ' ' }
    return value;
}
let render_file = function (lines, file_type, date, working_directory, file_name, index) {
    if(!lines) return null
    
    return new Promise((resolve, reject) => {
        let date_format = `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}${date.getHours()}${date.getMinutes()}${date.getSeconds()}`
        
        if (!file_name) {
            file_name = path.resolve(working_directory, `${file_type}_${date_format}_${index}.ach`)
        } else {
            file_name = path.resolve(working_directory, `${file_type}_${index}_${file_name}`)
        };

        fs.writeFile(file_name, lines.join('\n'), function (error) {
            if (error) { reject(error) }
            else { resolve(file_name) }
        });
    });
}
let render_zfill = function (value, max_length) {
    let string_value = String(value);

    while (string_value.length < max_length) { string_value = `0${string_value}` }
    return string_value;
}

/* FUNCTIONS */
let getFileJSON = function (absolute_path) {
    return new Promise((resolve, reject) => {
        let fileStream = fs.createReadStream(absolute_path);
        if (DEBUG) { debug_input_file(fileStream) }

        axios(
            {
                method: 'post',
                url: 'http://localhost:8080/files/create',
                data: fileStream

            }).then(response => {
                let error = response.data.error, id = response.data.id;
                if (error) { reject(new Error(error)) }

                axios(
                    {
                        method: 'get',
                        url: `http://localhost:8080/files/${id}`

                    }).then(response => {
                        resolve(response.data)

                    }).catch(error => { reject(new Error(error)) });

            }).catch(error => { reject(new Error(error)) });
    });
}
let recalculateJSON = function (json_content) {
    let line_count = 1, file_control =
    {
        'id': '',
        'batchCount': 0,
        'blockCount': 0,
        'entryAddendaCount': 0,
        'entryHash': 0,
        'totalDebit': 0,
        'totalCredit': 0
    }

    // Batches
    let entry_sequence_number;
    for (let x = 0; x < json_content['batches'].length; x++) {
        json_content['batches'][x]['batchHeader']['batchNumber'] = x + 1;
        line_count += 1; // batch header

        const is_IAT = json_content['batches'][x]['batchHeader']['standardEntryClassCode'] == 'IAT'

        let batch_control =
        {
            'id': '',
            'serviceClassCode': json_content['batches'][x]['batchHeader']['serviceClassCode'],
            'entryAddendaCount': 0,
            'entryHash': 0,
            'totalDebit': 0,
            'totalCredit': 0,
            'companyIdentification': is_IAT ? json_content['batches'][x]['batchHeader']['originatorIdentification'] : json_content['batches'][x]['batchHeader']['companyIdentification'],
            'ODFIIdentification': json_content['batches'][x]['batchHeader']['ODFIIdentification'],
            'batchNumber': x + 1
        }

        // Entries
        for (let y = 0; y < json_content['batches'][x]['entryDetails'].length; y++) {
            let total_key = get_settlement_direction(json_content['batches'][x]['entryDetails'][y]) === 'credit' ? 'totalCredit' : 'totalDebit';
            entry_sequence_number = parseInt(json_content['batches'][x]['entryDetails'][y]['traceNumber'].slice(8));

            // Addenda - Type
            let addenda_count = 0, addenda_keys = get_addendas(json_content['batches'][x]['entryDetails'][y]);
            for (let z = 0; z < addenda_keys.length; z++) {
                // Addenda - Line Item
                let addendas = json_content['batches'][x]['entryDetails'][y][addenda_keys[z]];
                if (!Array.isArray(addendas)) { addendas = [addendas] }

                for (let a = 0; a < addendas.length; a++) {
                    addendas[a]['entryDetailSequenceNumber'] = entry_sequence_number;
                    addenda_count += 1;
                }
            }

            batch_control['entryAddendaCount'] += 1;
            batch_control['entryAddendaCount'] += addenda_count;

            batch_control['entryHash'] += parseInt(json_content['batches'][x]['entryDetails'][y]['RDFIIdentification']);
            batch_control[total_key] += json_content['batches'][x]['entryDetails'][y]['amount'];

            file_control['entryAddendaCount'] += 1;
            file_control['entryAddendaCount'] += addenda_count;
            file_control['entryHash'] += parseInt(json_content['batches'][x]['entryDetails'][y]['RDFIIdentification']);
            file_control[total_key] += json_content['batches'][x]['entryDetails'][y]['amount'];

            line_count += 1; // entry
            line_count += addenda_count; // addenda
        }

        batch_control['entryHash'] = parseInt(String(batch_control['entryHash']).slice(-10));
        json_content['batches'][x]['batchControl'] = batch_control;

        file_control['batchCount'] += 1;

        line_count += 1; // batch control
    }

    line_count += 1; // file control
    while (line_count % 10) { line_count += 1 } // file block

    file_control['blockCount'] = line_count / 10;
    file_control['entryHash'] = parseInt(String(file_control['entryHash']).slice(-10));
    json_content['fileControl'] = file_control;

    return json_content;
}
let renderBatchControlFromJSON = function (batch_control_json_content) {
    let json_content = { ...batch_control_json_content };
    json_content['reserved'] = json_content['reserved'] ? json_content['reserved'] : '';
    json_content['messageAuthenticationCode'] = json_content['messageAuthenticationCode'] ? json_content['messageAuthenticationCode'] : '';

    let batch_control = `8${json_content['serviceClassCode']}`;

    batch_control += render_zfill(json_content['entryAddendaCount'], 6);
    batch_control += render_zfill(json_content['entryHash'], 10);
    batch_control += render_zfill(json_content['totalDebit'], 12);
    batch_control += render_zfill(json_content['totalCredit'], 12);
    batch_control += render_dynamic_length(json_content['companyIdentification'], 10);
    batch_control += render_dynamic_length(json_content['messageAuthenticationCode'], 19);
    batch_control += render_dynamic_length(json_content['reserved'], 6);

    batch_control += `${json_content['ODFIIdentification']}`;

    batch_control += render_zfill(json_content['batchNumber'], 7);

    return batch_control;
}
let renderBatchHeaderFromJSON = function (batch_header_json_content) {
    let json_content = { ...batch_header_json_content };
    json_content['companyDiscretionaryData'] = json_content['companyDiscretionaryData'] ? json_content['companyDiscretionaryData'] : '';
    json_content['companyDescriptiveDate'] = json_content['companyDescriptiveDate'] ? json_content['companyDescriptiveDate'] : '';

    let batch_header = `5${json_content['serviceClassCode']}`;

    batch_header += render_dynamic_length(json_content['companyName'], 16);
    batch_header += render_dynamic_length(json_content['companyDiscretionaryData'], 20);
    batch_header += render_dynamic_length(json_content['companyIdentification'], 10);

    batch_header += `${json_content['standardEntryClassCode']}`;

    batch_header += render_dynamic_length(json_content['companyEntryDescription'], 10);
    batch_header += render_dynamic_length(json_content['companyDescriptiveDate'], 6);

    batch_header += `${json_content['effectiveEntryDate']}${json_content['settlementDate'] || '   '}${json_content['originatorStatusCode']}${json_content['ODFIIdentification']}`;

    batch_header += render_zfill(json_content['batchNumber'], 7);

    return batch_header;
}
let renderIATBatchHeaderFromJSON = function (batch_header_json_content) {
    let json_content = { ...batch_header_json_content };

    let batch_header = `5${json_content['serviceClassCode']}                `;

    batch_header += render_dynamic_length(json_content['foreignExchangeIndicator'], 2);
    batch_header += render_dynamic_length(json_content['foreignExchangeReferenceIndicator'], 1);
    batch_header += render_dynamic_length(json_content['foreignExchangeReference'], 15);
    batch_header += render_dynamic_length(json_content['ISODestinationCountryCode'], 2);
    batch_header += render_dynamic_length(json_content['originatorIdentification'], 10);

    batch_header += `${json_content['standardEntryClassCode']}`;

    batch_header += render_dynamic_length(json_content['companyEntryDescription'], 10);
    batch_header += render_dynamic_length(json_content['ISOOriginatingCurrencyCode'], 3);
    batch_header += render_dynamic_length(json_content['ISODestinationCurrencyCode'], 3);
    batch_header += render_dynamic_length(json_content['effectiveEntryDate'], 6);
    batch_header += '   ';
    batch_header += render_dynamic_length(json_content['originatorStatusCode'], 1);
    batch_header += render_dynamic_length(json_content['ODFIIdentification'], 8);

    batch_header += render_zfill(json_content['batchNumber'], 7);

    return batch_header;
}
let renderIATPaymentEntryAddendaFromJSON = function (entry_addenda_json_content) {
    let json_content = { ...entry_addenda_json_content };

    let entry_addenda = `7${json_content['typeCode']}`;
    switch (json_content['typeCode']) {

        case '10':
            entry_addenda += render_dynamic_length(json_content['transactionTypeCode'], 3);
            entry_addenda += render_zfill(json_content['foreignPaymentAmount'], 18);
            entry_addenda += render_dynamic_length('', 22);
            entry_addenda += render_dynamic_length(json_content['name'], 35);
            entry_addenda += render_dynamic_length('', 6);
            break;
        case '11':
            entry_addenda += render_dynamic_length(json_content['originatorName'], 35);
            entry_addenda += render_dynamic_length(json_content['originatorStreetAddress'], 35);
            entry_addenda += render_dynamic_length('', 14);
            break;
        case '12':
            entry_addenda += render_dynamic_length(json_content['originatorCityStateProvince'], 35);
            entry_addenda += render_dynamic_length(json_content['originatorCountryPostalCode'], 35);
            entry_addenda += render_dynamic_length('', 14);
            break;
        case '13':
            entry_addenda += render_dynamic_length(json_content['ODFIName'], 35);
            entry_addenda += render_zfill(json_content['ODFIIDNumberQualifier'], 2);
            entry_addenda += render_dynamic_length(json_content['ODFIIdentification'], 34);
            entry_addenda += render_dynamic_length(json_content['ODFIBranchCountryCode'], 3);
            entry_addenda += render_dynamic_length('', 10);
            break;
        case '14':
            entry_addenda += render_dynamic_length(json_content['RDFIName'], 35);
            entry_addenda += render_zfill(json_content['RDFIIDNumberQualifier'], 2);
            entry_addenda += render_dynamic_length(json_content['RDFIIdentification'], 34);
            entry_addenda += render_dynamic_length(json_content['RDFIBranchCountryCode'], 3);
            entry_addenda += render_dynamic_length('', 10);
            break;
        case '15':
            entry_addenda += render_dynamic_length(json_content['receiverIDNumber'], 15);
            entry_addenda += render_dynamic_length(json_content['receiverStreetAddress'], 35);
            entry_addenda += render_dynamic_length('', 34);
            break;
        case '16':
            entry_addenda += render_dynamic_length(json_content['receiverCityStateProvince'], 35);
            entry_addenda += render_dynamic_length(json_content['receiverCountryPostalCode'], 35);
            entry_addenda += render_dynamic_length('', 14);
            break;
        case '17':
            entry_addenda += render_dynamic_length(json_content['paymentRelatedInformation'], 80);
            entry_addenda += render_zfill(json_content['sequenceNumber'], 4);
            break;
        case '18':
            entry_addenda += render_dynamic_length(json_content['foreignCorrespondentBankName'], 35);
            entry_addenda += render_dynamic_length(json_content['foreignCorrespondentBankIDNumberQualifier'], 2);
            entry_addenda += render_dynamic_length(json_content['foreignCorrespondentBankIDNumber'], 34);
            entry_addenda += render_dynamic_length(json_content['foreignCorrespondentBankBranchCountryCode'], 3);
            entry_addenda += render_dynamic_length(json_content[''], 6);
            entry_addenda += render_zfill(json_content['sequenceNumber'], 4);
            break;
    }

    entry_addenda += render_zfill(json_content['entryDetailSequenceNumber'], 7);
    return entry_addenda;
}

let renderPaymentEntryAddendaFromJSON = function (entry_addenda_json_content) {
    let json_content = { ...entry_addenda_json_content };

    let entry_addenda = `7${json_content['typeCode']}`;

    if (json_content['typeCode'] == '98') {
        // NOC Addenda - requires a different format for the Addenda record
        entry_addenda += json_content['changeCode'];
        entry_addenda += json_content['originalTrace'];
        entry_addenda += render_dynamic_length('', 6);
        entry_addenda += json_content['originalDFI'];
        entry_addenda += render_dynamic_length(json_content['correctedData'] || '', 29);
        entry_addenda += render_dynamic_length('', 15);
        entry_addenda += json_content['traceNumber'];
    } else {
        entry_addenda += render_dynamic_length(json_content['paymentRelatedInformation'] || '', 80);
        entry_addenda += render_zfill(json_content['sequenceNumber'] || '1', 4);
        entry_addenda += render_zfill(json_content['entryDetailSequenceNumber'], 7);
    }

    return entry_addenda;
}
let renderReturnEntryAddendaFromJSON = function (entry_addenda_json_content) {
    let entry_addenda = ''
    let json_content = { ...entry_addenda_json_content };
    if (json_content['typeCode'] == '99') {
        json_content['dateOfDeath'] = json_content['dateOfDeath'] ? json_content['dateOfDeath'] : '';

        entry_addenda = `7${json_content['typeCode']}${json_content['returnCode']}${json_content['originalTrace']}`;

        entry_addenda += render_dynamic_length(json_content['dateOfDeath'], 6);

        entry_addenda += `${json_content['originalDFI']}`;

        entry_addenda += render_dynamic_length(json_content['addendaInformation'], 44);

        entry_addenda += `${json_content['traceNumber']}`;
    } else {
        entry_addenda = `7${json_content['typeCode']}`;
        entry_addenda += render_zfill(json_content['changeCode'], 3);
        entry_addenda += render_dynamic_length(json_content['originalTrace'], 15);
        entry_addenda += render_dynamic_length(' ', 6);
        entry_addenda += render_dynamic_length(json_content['originalDFI'], 8);
        entry_addenda += render_dynamic_length(json_content['correctedData'], 29);
        entry_addenda += render_dynamic_length(' ', 15);
        entry_addenda += render_dynamic_length(json_content['traceNumber'], 15);
    }
    return entry_addenda;
}
let renderIATEntryRecordFromJSON = function (entry_record_json_content) {
    let json_content = { ...entry_record_json_content };

    let entry_addenda_keys = get_addendas(json_content);
    let entry_record_keys = Object.keys(json_content).filter((key) => { return key !== 'id' && key !== 'category' && entry_addenda_keys.indexOf(key) === -1 })

    let entry_record = `6${json_content['transactionCode']}`;
    entry_record += render_dynamic_length(json_content['RDFIIdentification'], 8);
    entry_record += render_dynamic_length(json_content['checkDigit'], 1);
    entry_record += render_zfill(json_content['AddendaRecords'], 4);;
    entry_record += '             '
    entry_record += render_zfill(json_content['amount'], 10);
    entry_record += render_dynamic_length(json_content['DFIAccountNumber'], 35);
    entry_record += '  '
    entry_record += render_dynamic_length(json_content['OFACScreeningIndicator'], 1);
    entry_record += render_dynamic_length(json_content['SecondaryOFACScreeningIndicator'], 1);
    entry_record += render_zfill(json_content['addendaRecordIndicator'], 1);
    entry_record += render_dynamic_length(json_content['traceNumber'], 15);

    return entry_record;
}
let renderEntryRecordFromJSON = function (entry_record_json_content) {
    let json_content = { ...entry_record_json_content };

    let entry_addenda_keys = get_addendas(json_content);
    let entry_record_keys = Object.keys(json_content).filter((key) => { return key !== 'id' && key !== 'category' && entry_addenda_keys.indexOf(key) === -1 })

    let entry_record = `6`;

    let has_addenda_indicator = entry_record_keys.indexOf('addendaRecordIndicator') !== -1;
    for (let x = 0; x < entry_record_keys.length; x++) {
        let key = entry_record_keys[x];
        if (key === 'traceNumber' && !has_addenda_indicator) { entry_record += '0' }

        if (key !== 'amount') { entry_record += String(json_content[key]) }
        else { entry_record += render_zfill(json_content[key], 10) }

        if (entry_record.length === 94) { break }
    }

    return entry_record;
}
let renderFileControlFromJSON = function (file_control_json_content) {
    let json_content = { ...file_control_json_content };
    json_content['reserved'] = json_content['reserved'] ? json_content['reserved'] : '';

    let file_control = `9`;

    file_control += render_zfill(json_content['batchCount'], 6);
    file_control += render_zfill(json_content['blockCount'], 6);
    file_control += render_zfill(json_content['entryAddendaCount'], 8);
    file_control += render_zfill(json_content['entryHash'], 10);
    file_control += render_zfill(json_content['totalDebit'], 12);
    file_control += render_zfill(json_content['totalCredit'], 12);
    file_control += render_dynamic_length(json_content['reserved'], 39);

    return file_control;
}
let renderFileHeaderFromJSON = function (file_header_json_content) {
    let json_content = { ...file_header_json_content };
    json_content['recordSize'] = '094';
    json_content['blockingFactor'] = '10'
    json_content['formatCode'] = '1'

    let file_header = `101 ${json_content['immediateDestination']} ${json_content['immediateOrigin']}`;

    let file_header_fields = ['fileCreationDate', 'fileCreationTime', 'fileIDModifier', 'recordSize', 'blockingFactor', 'formatCode'];
    for (let x = 0; x < file_header_fields.length; x++) { file_header += json_content[file_header_fields[x]] }

    file_header += render_dynamic_length(json_content['immediateDestinationName'], 23)
    file_header += render_dynamic_length(json_content['immediateOriginName'], 23)

    while (file_header.length < 94) { file_header += ' ' }

    return file_header
}
let renderIATFileContentFromJSON = function (json_content) {
    if(!json_content) return null
    let lines = Array();

    // File Header
    lines.push(renderFileHeaderFromJSON(json_content['fileHeader']));

    // Batches
    for (let x = 0; x < json_content['batches'].length; x++) {
        // Batch Header
        lines.push(renderIATBatchHeaderFromJSON(json_content['batches'][x]['batchHeader']));

        // Entries
        for (let y = 0; y < json_content['batches'][x]['entryDetails'].length; y++) {
            // Entry Record
            lines.push(renderIATEntryRecordFromJSON(json_content['batches'][x]['entryDetails'][y]));

            // Entry Addenda - Types
            let addenda_keys = get_addendas(json_content['batches'][x]['entryDetails'][y]);
            for (let z = 0; z < addenda_keys.length; z++) {
                // - Entry Addenda - Line Item
                let addendas = json_content['batches'][x]['entryDetails'][y][addenda_keys[z]];
                if (!Array.isArray(addendas)) { addendas = [addendas] }

                for (let a = 0; a < addendas.length; a++) {
                    const typeCode = parseInt(addendas[a]['typeCode'], 10)
                    if (typeCode < 98) {
                        lines.push(renderIATPaymentEntryAddendaFromJSON(addendas[a]))
                    }
                    else {
                        lines.push(renderReturnEntryAddendaFromJSON(addendas[a]))
                    }
                }
            }
        }

        // Batch Control
        lines.push(renderBatchControlFromJSON(json_content['batches'][x]['batchControl']));
    }

    // File Control
    lines.push(renderFileControlFromJSON(json_content['fileControl']));

    // Blocking Factor
    while (lines.length % 10) {
        lines.push('9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999');
    }

    // Exit
    return lines
}
let renderFileContentFromJSON = function (json_content) {
    if(!json_content) return null
    let lines = Array();

    // File Header
    lines.push(renderFileHeaderFromJSON(json_content['fileHeader']));

    // Batches
    for (let x = 0; x < json_content['batches'].length; x++) {
        // Batch Header
        lines.push(renderBatchHeaderFromJSON(json_content['batches'][x]['batchHeader']));

        // Entries
        for (let y = 0; y < json_content['batches'][x]['entryDetails'].length; y++) {
            // Entry Record
            let is_return = is_entry_return(json_content['batches'][x]['entryDetails'][y])
            lines.push(renderEntryRecordFromJSON(json_content['batches'][x]['entryDetails'][y]));

            // Entry Addenda - Types
            let addenda_keys = get_addendas(json_content['batches'][x]['entryDetails'][y]);
            for (let z = 0; z < addenda_keys.length; z++) {
                // - Entry Addenda - Line Item
                let addendas = json_content['batches'][x]['entryDetails'][y][addenda_keys[z]];
                if (!Array.isArray(addendas)) { addendas = [addendas] }

                for (let a = 0; a < addendas.length; a++) {
                    const typeCode = parseInt(addendas[a]['typeCode'], 10)
                    if (typeCode < 98) {
                        lines.push(renderPaymentEntryAddendaFromJSON(addendas[a]))
                    }
                    else {
                        lines.push(renderReturnEntryAddendaFromJSON(addendas[a]))
                    }
                }
            }
        }

        // Batch Control
        lines.push(renderBatchControlFromJSON(json_content['batches'][x]['batchControl']));
    }

    // File Control
    lines.push(renderFileControlFromJSON(json_content['fileControl']));

    // Blocking Factor
    while (lines.length % 10) {
        lines.push('9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999');
    }

    // Exit
    return lines
}
let splitIATFileJSON = function (json_content) {
    let payment_file = null, return_file = null;

    for (let x = 0; x < json_content['IATBatches'].length; x++) {
        let payment_batch = null, return_batch = null;

        for (let y = 0; y < json_content['IATBatches'][x]['IATEntryDetails'].length; y++) {
            let is_return = is_entry_return(json_content['IATBatches'][x]['IATEntryDetails'][y])

            if (is_return === false) {
                if (payment_batch === null) { payment_batch = { 'batchHeader': json_content['IATBatches'][x]['IATBatchHeader'], 'entryDetails': [] } }
                payment_batch['entryDetails'].push(json_content['IATBatches'][x]['IATEntryDetails'][y])
            }
            else {
                if (return_batch === null) { return_batch = { 'batchHeader': json_content['IATBatches'][x]['IATBatchHeader'], 'entryDetails': [] } }
                return_batch['entryDetails'].push(json_content['IATBatches'][x]['IATEntryDetails'][y])
            }
        }

        if (payment_batch !== null) {
            if (payment_file === null) { payment_file = { 'fileHeader': json_content['fileHeader'], 'batches': [] } }
            payment_file['batches'].push(payment_batch)
        }
        if (return_batch !== null) {
            if (return_file === null) { return_file = { 'fileHeader': json_content['fileHeader'], 'batches': [] } }
            return_file['batches'].push(return_batch)
        }
    }

    return {
        'payments': payment_file,
        'returns': return_file
    }
}

let splitFileJSON = function (json_content) {
    let payment_file = null, return_file = null;

    for (let x = 0; x < json_content['batches'].length; x++) {
        let payment_batch = null, return_batch = null;

        for (let y = 0; y < json_content['batches'][x]['entryDetails'].length; y++) {
            let is_return = is_entry_return(json_content['batches'][x]['entryDetails'][y])

            if (is_return === false) {
                if (payment_batch === null) { payment_batch = { 'batchHeader': json_content['batches'][x]['batchHeader'], 'entryDetails': [] } }
                payment_batch['entryDetails'].push(json_content['batches'][x]['entryDetails'][y])
            }
            else {
                if (return_batch === null) { return_batch = { 'batchHeader': json_content['batches'][x]['batchHeader'], 'entryDetails': [] } }
                return_batch['entryDetails'].push(json_content['batches'][x]['entryDetails'][y])
            }
        }

        if (payment_batch !== null) {
            if (payment_file === null) { payment_file = { 'fileHeader': json_content['fileHeader'], 'batches': [] } }
            payment_file['batches'].push(payment_batch)
        }
        if (return_batch !== null) {
            if (return_file === null) { return_file = { 'fileHeader': json_content['fileHeader'], 'batches': [] } }
            return_file['batches'].push(return_batch)
        }
    }

    return {
        'payments': payment_file,
        'returns': return_file
    }
}
let validateSplitFiles = function (comingled_control, payments_control, returns_control) {
    let summed_control;

    if (!payments_control) { summed_control = returns_control }
    else if (!returns_control) { summed_control = payments_control }
    else {
        summed_control =
        {
            'batchCount': payments_control['batchCount'] + returns_control['batchCount'],
            // 'blockCount': payments_control['blockCount'] + returns_control['blockCount'],
            'entryAddendaCount': payments_control['entryAddendaCount'] + returns_control['entryAddendaCount'],
            'entryHash': payments_control['entryHash'] + returns_control['entryHash'],
            'totalDebit': payments_control['totalDebit'] + returns_control['totalDebit'],
            'totalCredit': payments_control['totalCredit'] + returns_control['totalCredit']
        }
        summed_control['entryHash'] = parseInt(String(summed_control['entryHash']).slice(-10));
    }

    if (summed_control['batchCount'] !== comingled_control['batchCount']) { throw new Error(`Actual batchCount "${summed_control['batchCount']}" does not equal expected value "${comingled_control['batchCount']}"!`) }
    // if (summed_control['blockCount'] !== comingled_control['blockCount']){throw new Error(`Actual blockCount "${summed_control['blockCount']}" does not equal expected value "${comingled_control['blockCount']}"!`)}
    if (summed_control['entryAddendaCount'] !== comingled_control['entryAddendaCount']) { throw new Error(`Actual entryAddendaCount "${summed_control['entryAddendaCount']}" does not equal expected value "${comingled_control['entryAddendaCount']}"!`) }
    if (summed_control['entryHash'] !== comingled_control['entryHash']) { throw new Error(`Actual entryHash "${summed_control['entryHash']}" does not equal expected value "${comingled_control['entryHash']}"!`) }
    if (summed_control['totalDebit'] !== comingled_control['totalDebit']) { throw new Error(`Actual totalDebit "${summed_control['totalDebit']}" does not equal expected value "${comingled_control['totalDebit']}"!`) }
    if (summed_control['totalCredit'] !== comingled_control['totalCredit']) { throw new Error(`Actual totalCredit "${summed_control['totalCredit']}" does not equal expected value "${comingled_control['totalCredit']}"!`) }
}

/* MAIN */
async function split_from_json(json_content, date, working_directory, file_name, renderFiles = true) {
    // Adding in the IAT batches

    // NOTE: input format varies on CLI vs API
    json_content = json_content['file'] ? json_content['file'] : json_content;

    let content_integrity =
    {
        'batchCount': json_content['fileControl']['batchCount'],
        'blockCount': json_content['fileControl']['blockCount'],
        'entryAddendaCount': json_content['fileControl']['entryAddendaCount'],
        'entryHash': json_content['fileControl']['entryHash'],
        'totalDebit': json_content['fileControl']['totalDebit'],
        'totalCredit': json_content['fileControl']['totalCredit']
    };

    let split_iat_json_content = {};
    let content_integrity_iat = {};
    if (json_content.IATBatches) {

        // if there are IATBatches, remove them from the content_integrity check for now
        content_integrity.batchCount -= json_content.IATBatches.length

        let IATentryAdendaCount = 0
        let IATentryHash = 0
        let IATtotalDebit = 0
        let IATtotalCredit = 0

        for (let batch of json_content.IATBatches) {
            IATentryAdendaCount += batch.batchControl.entryAddendaCount
            IATentryHash += batch.batchControl.entryHash
            IATtotalDebit += batch.batchControl.totalDebit
            IATtotalCredit += batch.batchControl.totalCredit
        }

        content_integrity.entryAddendaCount -= IATentryAdendaCount
        content_integrity.entryHash -= IATentryHash
        content_integrity.totalDebit -= IATtotalDebit
        content_integrity.totalCredit -= IATtotalCredit

        split_iat_json_content = await splitIATFileJSON(json_content);

        content_integrity_iat =
        {
            'batchCount': json_content.IATBatches.length,
            'blockCount': 0,
            'entryAddendaCount': IATentryAdendaCount,
            'entryHash': IATentryHash,
            'totalDebit': IATtotalDebit,
            'totalCredit': IATtotalCredit
        };

    } else {
        split_iat_json_content = {
            'payments': null,
            'returns': null,
            'iat_payments': null,
            'iat_returns': null,
        }
    }

    // Split JSON Files
    let split_json_content = await splitFileJSON(json_content);
    split_json_content =
    {
        'payments': split_json_content['payments'] ? recalculateJSON(split_json_content['payments']) : null,
        'returns': split_json_content['returns'] ? recalculateJSON(split_json_content['returns']) : null,
        'iat_payments': split_iat_json_content['payments'] ? recalculateJSON(split_iat_json_content['payments']) : null,
        'iat_returns': split_iat_json_content['returns'] ? recalculateJSON(split_iat_json_content['returns']) : null,
    };
    // - Integrity Check
    if ((!split_json_content['payments'] && !split_iat_json_content['payments']) || (!split_json_content['returns'] &&  !split_iat_json_content['payments'])) { console.error('Split operation returned no ACH payment or return files!') }
        // - Validate
        validateSplitFiles(
            content_integrity,
            split_json_content['payments'] ? split_json_content['payments']['fileControl'] : null,
            split_json_content['returns'] ? split_json_content['returns']['fileControl'] : null
        );
    if (json_content.IATBatches) {
        validateSplitFiles(
            content_integrity_iat,
            split_json_content['iat_payments'] ? split_json_content['iat_payments']['fileControl'] : null,
            split_json_content['iat_returns'] ? split_json_content['iat_returns']['fileControl'] : null
        )
    }

    let paymentsJSON = split_json_content['payments']
    let returnsJSON = split_json_content['returns']
    let IATpaymentsJSON = split_json_content['iat_payments']
    let IATreturnsJSON = split_json_content['iat_returns']

    if (renderFiles) {
        // Render File Content
        let payments_file_content = await renderFileContentFromJSON(paymentsJSON);
        let returns_file_content = await renderFileContentFromJSON(returnsJSON);
        let iat_payments_file_content = await renderIATFileContentFromJSON(IATpaymentsJSON);
        let iat_returns_file_content = await renderIATFileContentFromJSON(IATreturnsJSON);

        // Exit
        // TODO verify what to do with subnet_ach_iat and ach_returns_iat is likey better to use a different index
        return {
            'payments': await render_file(payments_file_content, 'subnet_ach', date, working_directory, file_name, 0),
            'returns': await render_file(returns_file_content, 'ach_returns', date, working_directory, file_name, 0),
            'iat_payments': await render_file(iat_payments_file_content, 'subnet_ach_iat', date, working_directory, file_name, 1),
            'iat_returns': await render_file(iat_returns_file_content, 'ach_returns_iat', date, working_directory, file_name, 1),
        }
    } else {
        // just return the parsed values
        return {
            'payments': paymentsJSON,
            'returns': returnsJSON,
            'iat_payments': IATpaymentsJSON,
            'iat_returns': IATreturnsJSON,
        }
    }
}

async function split_from_native_file(absolute_path, date, working_directory) {
    let json_content = await getFileJSON(absolute_path);
    return await split_from_json(json_content, date, working_directory);
}

module.exports.split_from_json = split_from_json
module.exports.split_from_native_file = (absolute_path, date, working_directory) => { return split_from_native_file(absolute_path, date, working_directory) }
