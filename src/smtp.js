'use strict';

var Promise = require("bluebird");
Promise.longStackTraces();
const fs = require('fs');
var path = require('path');

const ach = require('./ach')

require('dotenv').config({ path: __dirname + '/.env' })
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const nodemailer = require("nodemailer");
let SMTP_USERNAME = process.env.SMTP_USERNAME;
let SMTP_PASSWORD = process.env.SMTP_PASSWORD;
let SMTP_PORT = process.env.SMTP_PORT;
let SMTP_SERVER = process.env.SMTP_SERVER;

const { ImapFlow } = require('imapflow');
let IMAP_SERVER = process.env.IMAP_SERVER;
let IMAP_PORT = process.env.IMAP_PORT;
let IMAP_USERNAME = process.env.IMAP_USERNAME || process.env.SMTP_USERNAME
let IMAP_PASSWORD = process.env.IMAP_PASSWORD || process.env.SMTP_PASSWORD

const simpleParser = require('mailparser').simpleParser;

let transporter = nodemailer.createTransport({
    host: SMTP_SERVER,
    port: SMTP_PORT,
    service: "Outlook365",
    secure: true,
    auth: {
        user: SMTP_USERNAME,
        pass: SMTP_PASSWORD,
    },
    tls: {
        ciphers:'SSLv3'
    }
});

const imap = new ImapFlow({
    host: IMAP_SERVER,
    port: IMAP_PORT,
    secure: true,
    auth: {
        user: IMAP_USERNAME,
        pass: IMAP_PASSWORD
    }
});

const emailApprovedSenders = [
    "brandon.hedge@lineagebank.com",
    "jason.ezell@lineagefn.com",
    "cheryl.lamberth@lineagefn.com",
    "gloria.dodd@lineagebank.com",
    "htc.reports@fisglobal.com",
    "ellen.hartley@lineagefn.com"
]

const achApprovedSenders = [
    "cheryl.lamberth@lineagefn.com",
    "gloria.dodd@lineagebank.com",
    "maria@citizensbankatwood.com",
    "stephanie@citizensbankatwood.com",
    "ellen.hartley@lineagefn.com",
    "paul.hignutt@lineagefn.com",
    "brandon.hedge@lineagebank.com"
]

const achApprovedRecipients = [
    "synctera.ach@lineagebank.com",
    "synapse.ach@lineagebank.com"
]

const approvedRecipients = [
    "synctera.fis@lineagebank.com",
    "built.fis@lineagebank.com",
    "hawthorn.river@lineagebank.com",
    "hawthorn.river@lineagefn.com",
    "baas.ach.advice@lineagebank.com"
]

const approvedAttachmentExtensions = [
    "csv",
    "pdf",
    "xls",
    "xlsx",
    "ach"
]

let folderMappings = []

folderMappings.push({ to: 'synctera.ach@lineagebank.com', destination: `C:\\SFTP\\Synctera\\ach\\inbound` })
folderMappings.push({ to: 'synapse.ach@lineagebank.com', destination: `C:\\SFTP\\Synapse\\tosynapse` })
folderMappings.push({ to: 'synctera.fis@lineagebank.com', destination: `C:\\SFTP\\Synctera\\fis` })
folderMappings.push({ to: 'built.fis@lineagebank.com', destination: `C:\\SFTP\\Built\\fis` })
folderMappings.push({ to: 'hawthorn.river@lineagebank.com', destination: `C:\\SFTP\\HawthornRiver\\toHawthorn` })
folderMappings.push({ to: 'hawthorn.river@lineagefn.com', destination: `C:\\SFTP\\HawthornRiver\\toHawthorn` })

async function main(smtpTransporter, imap) {
        await getSMTP(imap)
}

main(transporter, imap);

async function getSMTP(imap) {
    // Wait until client connects and authorizes
    await imap.connect();

    let mailbox = await imap.mailboxOpen('INBOX');
    let messageIds = [];

    // fetch UID for all messages in a mailbox
    for await (let msg of imap.fetch('1:*', {uid: true})){
        messageIds.push( msg.uid );
    }

    if (messageIds.length == 0) {
        console.log(`Exiting the getSMTP process as there are [${messageIds.length}] messages to process.`)
        // log out and close connection
        await imap.logout();
        return
    } else {
        console.log(`There are [${messageIds.length}] mail messages to process...`)
    }
    // Select and lock a mailbox. Throws if mailbox does not exist
    let lock = await imap.getMailboxLock('INBOX');
    try {
        // fetch latest message source
        // imap.mailbox includes information about currently selected mailbox
        // "exists" value is also the largest sequence number available in the mailbox
        let lastSequence = messageIds.length //imap.mailbox.exists;

        for (let seqId=0;seqId<lastSequence;seqId++){

            let msgUID = messageIds[seqId]
            console.log(`Processing message UID: ${msgUID}...`)

            let {content} = await imap.download(msgUID, undefined, {uid:true});

            let parsed = await simpleParser(content);
            let from = parsed.from.value[0].address.toLowerCase();
            let to = parsed.to.value;
            let attachments = parsed.attachments;
            let subject = parsed.subject;
            let msgDate = parsed.date;

            let EMAIL_DATE = msgDate.toISOString()
            EMAIL_DATE = EMAIL_DATE.replace(/:/g, '');
            EMAIL_DATE = EMAIL_DATE.replace(/-/g, '');

            let isAchApprovedSender = await approvedSender(msgUID, from, achApprovedSenders)
            let isAchApprovedRecipient = await approvedRecipient(msgUID, to, achApprovedRecipients)

            if (isAchApprovedRecipient){
                if (isAchApprovedSender){
                    console.log('Message UID:', msgUID, 'Approved ACH Sender.')
                } else {
                    console.error('Message UID:', msgUID, 'Not an Approved ACH Sender!!!')
                    await achSenderError(msgUID, from, achApprovedSenders)
                    await moveMessage(imap, msgUID, "rejected")

                    let messageBody = `ACH Inbound Email Sent TO:[${JSON.stringify(to)}] \n FROM:[${from}] \n\n But this user is not in the ALLOWED ACH SENDERS: [${achApprovedSenders}]`
                    await sendSMTP(transporter, "baas.ach.advice@lineagebank.com", "BaaS: ACH Inbound - REJECTED!", messageBody)
                    continue;
                }
            }

            let isApprovedSender = await approvedSender(msgUID, from, emailApprovedSenders)

            // is the user approved to send at all
            if (isApprovedSender) {
                console.log('Message UID:', msgUID, 'Approved Sender.')
            } else {
                console.error('Message UID:', msgUID, 'Not an Approved Sender!!!')
                await badSenderError(msgUID, from, emailApprovedSenders)
                await moveMessage(imap, msgUID, "rejected")
                continue;
            }

            let isApprovedRecipient = await approvedRecipient(msgUID, to, approvedRecipients)

            // is the user approved to send at all
            if (isApprovedRecipient || (isAchApprovedSender && !!isAchApprovedRecipient )) {
                console.log('Message UID:', msgUID, `Approved Recipient matched ${isApprovedRecipient} or ACH approve${isAchApprovedRecipient}.`)
            } else {
                console.error('Message UID:', msgUID, 'Not an Approved Recipient!!!')
                await badRecipientError(msgUID, to, approvedRecipients)
                await moveMessage(imap, msgUID, "rejected")
                continue;
            }

            // capture where the attachement should be written
            let approved = isAchApprovedRecipient || isApprovedRecipient 
            let attachmentPath = folderMappings.find(x => x.to === approved);

            if(!attachmentPath) {
                console.error('Message UID:', msgUID, `There is no attachment path defined on the SFTP server for the approved recipient [${isApprovedRecipient}]! `)
                await badPathError(msgUID, sApprovedRecipient)
                continue;
            }

            if (attachments.length) {
                for (let attachment of attachments){
                    let isApprovedAttachment = await approvedAttachment(attachment.filename, approvedAttachmentExtensions)

                    if(isApprovedAttachment) {
                        console.log('Message UID:', msgUID, `Writing the attachment [${attachment.filename}]... `)
                        let fileName = attachmentPath.destination + '\\' + EMAIL_DATE + '_' + attachment.filename
                        let fileWriter = fs.createWriteStream( fileName )
                        await fileWriter.write(attachment.content)

                        // if the attachement is an ACH file, send an advice to the internal distribution list
                        if(isAchApprovedRecipient && isAchApprovedSender){
                           await send_ach_advice (fileName, "baas.ach.advice@lineagebank.com", false) 
                        }
                        
                        console.log('Message UID:', msgUID, `Wrote attachment [${attachment.filename}].`)
                    } else {
                        console.error('Message UID:', msgUID, `The attachment file type is not approved, skipping processing for [${attachment.filename}]... `)
                    }
                }
                // move the message after all attachments are processed
                await moveMessage(imap, msgUID, "processed")
            } else {
                console.error('Message UID:', msgUID, `No attachment on the message, moving it to the rejected folder... `)
                await moveMessage(imap, msgUID, "rejected")
                continue;
            }
        }

        if(messageIds.length == 1) {
            console.log(`Processed [${messageIds.length}] mail message.`)
        } else {
            console.log(`Processed [${messageIds.length}] mail messages.`)
        }
    } finally {
        // Make sure lock is released, otherwise next `getMailboxLock()` never returns
        lock.release();

         // log out and close connection
         await imap.logout();
    }
    
    return
}

async function approvedSender (msgUID, sender, approvedSenders){
    return approvedSenders.includes(sender)
}

async function approvedAttachment (filename, approvedAttachmentExtensions){
    let returnVal = false

    for (let extension of approvedAttachmentExtensions){
        try{
            if (extension == filename.substr(filename.length - extension.length)){
                returnVal = true
            }
        } catch (error) {
            console.error('Message UID:', msgUID, `Error: Approved attachment check failed.`)
        }
    }
    return returnVal
}

async function approvedRecipient (msgUID, recipients, approvedRecipient){
    // return the first approved recipient or undefined if no match
    for(let recipient of recipients) {
        let isApproved = approvedRecipient.includes( recipient.address.toLowerCase() )
        if (isApproved) {
            console.log('Message UID:', msgUID, `Approved Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
            return recipient.address.toLowerCase()
        }
    }
    return undefined
}

async function badSenderError (msgUID, sender, approvedSenders){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message UID:', msgUID, 'write the badSenderError() code.', sender)
    return
}

async function achSenderError (msgUID, sender, approvedSenders){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message UID:', msgUID, 'ACH write the achSenderError() code.', sender)
    return
}

async function badPathError (msgUID, sender, type){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message UID:', msgUID, 'write the badPathError() code.')
    return
}

async function badRecipientError (msgUID, to, approvedRecipients){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message UID:', msgUID, 'write the badRecipientError() code.')
    return
}

async function moveMessage(imap, msgUID, destination){
    let options = {uid:true}
    let result = await imap.messageMove(msgUID, destination, options);
    console.log('Message UID:', msgUID, 'Moved', result.uidMap.size,'message', 'to', destination);
    return result
}

async function sendSMTP(smtpTransporter, to, subject, message, messageHTML) {
    if (!smtpTransporter) smtpTransporter = transporter;
    // send mail with defined transport object
    try{
        let info = await smtpTransporter.sendMail({
            from: 'baas@lineagebank.com', // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            text: message, // plain text body
            html: messageHTML, // html body
        });

        return info
    } catch (err) {
        throw err
    }
}

async function send_ach_advice(args, NotificationDL, isOutbound){
    let ach_data = await ach( args )

    let isJSON = false
    let achJSON = {}

    try {
        achJSON = JSON.parse(ach_data);
        isJSON = true
    } catch (e) {
        console.error("Parsing the ACH JSON failed. Check the output.");
    }

    console.log( ach_data )

    let direction = "INBOUND"

    if (isOutbound) {direction = "OUTBOUND"}

    let messageBody = `****************************************************************************************************\n`
    messageBody += `BaaS: ${direction} ACH Advice - Notification\n`
    messageBody += `****************************************************************************************************\n`
    messageBody += `\n\n`

    if (isJSON) {
        let spacing = "   "
        messageBody += `******** ACH Batch Details ********\n`
        messageBody += spacing + `FileControl: [ Immediate Origin:(${achJSON.fileHeader.immediateOriginName}) - Total Debit: ${ach.formatMoney(achJSON.fileControl.totalDebit, 2)} `// achJSON.fileControl
        messageBody += `Total Credit: ${ach.formatMoney("-" + achJSON.fileControl.totalCredit, 2)} `
        messageBody += `- fileCreationDate: ${achJSON.fileHeader.fileCreationDate} `
        messageBody += ']\n'
        let batchTotals = await parseBatchACH(achJSON, spacing)
        messageBody += batchTotals

        messageBody += `******** ACH Batch Details End ****\n`
       messageBody += `\n\n`
    }

    messageBody += `ACH FILE DETAILS:\n`
    messageBody += ach_data
    messageBody += `\n\n`

    await sendSMTP(transporter, NotificationDL, `BaaS: ${direction} ACH Notification - For:${NotificationDL}`, messageBody)

    return true
}

async function parseBatchACH(achJSON, spacing) {
    let output = ""
    let batchArray = achJSON.batches

    for (const batch of batchArray) {
        console.log(batch)
        output += spacing + 'Batch Number: (' + batch.batchHeader.batchNumber + `) [ ${batch.batchHeader.companyName} (${batch.batchHeader.companyEntryDescription}) ] `
        output += '- Effective Date: ' + batch.batchHeader.effectiveEntryDate + '\n' 
        output += spacing + spacing + spacing + `Batch(${batch.batchHeader.batchNumber}) Debit: ` + ach.formatMoney(batch.batchControl.totalDebit, 2) + '\n' 
        output += spacing + spacing + spacing + `Batch(${batch.batchHeader.batchNumber}) Credit: ` + ach.formatMoney('-' + batch.batchControl.totalCredit, 2) + '\n' 
        output += '\n'
    }


    return output
}

module.exports.send = (to, subject, message, messageHTML) => {
    return sendSMTP(null, to, subject, message, messageHTML)
}

module.exports.sendOutboundACH = (args, NotificationDL) => {
    return send_ach_advice(args, NotificationDL, true)
}

module.exports.sendInboundACH = (args, NotificationDL) => {
    return send_ach_advice(args, NotificationDL, false)
}
