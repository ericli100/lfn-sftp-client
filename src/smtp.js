'use strict';

var Promise = require("bluebird");
Promise.longStackTraces();
const fs = require('fs');
var path = require('path');

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
    "htc.reports@fisglobal.com"
]

const achApprovedSenders = [
    "cheryl.lamberth@lineagefn.com",
    "gloria.dodd@lineagebank.com",
    "maria@citizensbankatwood.com",
    "stephanie@citizensbankatwood.com"
]

const achApprovedRecipients = [
    "synctera.ach@lineagebank.com"
]

const approvedRecipients = [
    "synctera.fis@lineagebank.com",
    "built.fis@lineagebank.com"
]

let folderMappings = []
//folderMappings.push( {type: 'get', source: '/outbox', destination: 'C:\\SFTP\\Synctera\\inbox', processed: 'C:\\SFTP\\Synctera\\processed\\inbox' } )
folderMappings.push({ to: 'synctera.ach@lineagebank.com', destination: `C:\\SFTP\\Synctera\\ach\\inbound` })
folderMappings.push({ to: 'synctera.fis@lineagebank.com', destination: `C:\\SFTP\\Synctera\\fis` })
folderMappings.push({ to: 'built.fis@lineagebank.com', destination: `C:\\SFTP\\Built\\fis` })
//folderMappings.push( {type: 'put', source: 'C:\\SFTP\\Synctera\\outbox\\ach', destination: '/inbox/ach', processed: 'C:\\SFTP\\Synctera\\processed\\outbox\\ach'} )

async function main(smtpTransporter, imap) {
        await getSMTP(imap)

        // await sendSMTP(smtpTransporter, "brandon.hedge@lineagebank.com", "BaaS Test Send", "This is the body", "<b>this is the body</b>")
}

main(transporter, imap);

async function getSMTP(imap) {
    // Wait until client connects and authorizes
    await imap.connect();

    // Select and lock a mailbox. Throws if mailbox does not exist
    let lock = await imap.getMailboxLock('INBOX');
    try {
        // fetch latest message source
        // imap.mailbox includes information about currently selected mailbox
        // "exists" value is also the largest sequence number available in the mailbox
        let lastSequence = imap.mailbox.exists;

        for (let seqId=1;seqId<=lastSequence;seqId++){
            console.log(`Processing message: ${seqId}...`)

            let {content} = await imap.download(seqId);

            let parsed = await simpleParser(content);
            let from = parsed.from.value[0].address.toLowerCase();
            let to = parsed.to.value;
            let attachments = parsed.attachments;
            let subject = parsed.subject;
            let msgDate = parsed.date;

            let PROCESSING_DATE = msgDate.toISOString()
            PROCESSING_DATE = PROCESSING_DATE.replace(/:/g, '');

            let isAchApprovedSender = await approvedSender(seqId, from, achApprovedSenders)
            let isAchApprovedRecipient = await approvedRecipient(seqId, to, achApprovedRecipients)

            if (isAchApprovedRecipient){
                if (isAchApprovedSender){
                    console.log('Message:', seqId, 'Approved ACH Sender.')
                } else {
                    console.error('Message:', seqId, 'Not an Approved ACH Sender!!!')
                    await achSenderError(seqId, from, achApprovedSenders)
                    await moveMessage(imap, seqId, "rejected")
                    continue;
                }
            }

            let isApprovedSender = await approvedSender(seqId, from, emailApprovedSenders)

            // is the user approved to send at all
            if (isApprovedSender) {
                console.log('Message:', seqId, 'Approved Sender.')
            } else {
                console.error('Message:', seqId, 'Not an Approved Sender!!!')
                await badSenderError(seqId, from, emailApprovedSenders)
                await moveMessage(imap, seqId, "rejected")
                continue;
            }

            let isApprovedRecipient = await approvedRecipient(seqId, to, approvedRecipients)

            // is the user approved to send at all
            if (isApprovedRecipient) {
                console.log('Message:', seqId, `Approved Recipient matched ${isApprovedRecipient}.`)
            } else {
                console.error('Message:', seqId, 'Not an Approved Recipient!!!')
                await badRecipientError(seqId, to, approvedRecipients)
                await moveMessage(imap, seqId, "rejected")
                continue;
            }

            // capture where the attachement should be written
            let attachmentPath = folderMappings.find(x => x.to === isApprovedRecipient);

            if(!attachmentPath) {
                console.error('Message:', seqId, `There is no attachment path defined on the SFTP server for the approved recipient [${isApprovedRecipient}]! `)
                await badPathError(iseqId, sApprovedRecipient)
                continue;
            }

            if (attachments.length) {
                for (let attachment of attachments){
                    console.log('Message:', seqId, `Writing the attachment [${attachment.filename}]... `)
                    let fileWriter = fs.createWriteStream(attachmentPath.destination + '\\' + PROCESSING_DATE + '_' + attachment.filename)
                    await fileWriter.write(attachment.content)
                    console.log('Message:', seqId, `Wrote attachment [${attachment.filename}].`)
                    await moveMessage(imap, seqId, "processed")
                }
            } else {
                console.error('Message:', seqId, `No attachment on the message, moving it to the rejected folder... `)
                await moveMessage(imap, seqId, "rejected")
                continue;
            }
        }
    } finally {
        // Make sure lock is released, otherwise next `getMailboxLock()` never returns
        lock.release();
    }

    // log out and close connection
    await imap.logout();
}

async function approvedSender (seqId, sender, approvedSenders){
    return approvedSenders.includes(sender)
}

async function approvedRecipient (seqId, recipients, approvedRecipient){
    // return the first approved recipient or undefined if no match
    for(let recipient of recipients) {
        let isApproved = approvedRecipient.includes( recipient.address.toLowerCase() )
        if (isApproved) {
            console.log('Message:', seqId, `Approved Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
            return recipient.address.toLowerCase()
        }
    }
    return undefined
}

async function badSenderError (seqId, sender, approvedSenders){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message:', seqId, 'write the badSenderError() code.', sender)
    return
}

async function achSenderError (seqId, sender, approvedSenders){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message:', seqId, 'ACH write the achSenderError() code.', sender)
    return
}

async function badPathError (seqId, sender, type){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message:', seqId, 'write the badPathError() code.')
    return
}

async function badRecipientError (seqId, to, approvedRecipients){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'Message:', seqId, 'write the badRecipientError() code.')
    return
}



async function moveMessage(imap, seqId, destination){
    let options = {uid:false}
    let result = await imap.messageMove(seqId, destination, options);
    console.log('Moved %s messages', result.uidMap.size);
    return Promise.resolve({ result })
}

async function sendSMTP(transporter, to, subject, message, messageHTML) {
    // send mail with defined transport object
    let info = await transporter.sendMail({
        from: 'baas@lineagebank.com', // sender address
        to: to, // list of receivers
        subject: subject, // Subject line
        text: message, // plain text body
        html: messageHTML, // html body
    });
}

