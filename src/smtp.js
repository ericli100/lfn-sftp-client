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
]

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
       
        // let msg = await imap.fetchOne(imap.mailbox.exists, { source: true, envelope: true });
       
        // console.log(msg.source.toString());

        let lastSequence = imap.mailbox.exists;

        for (let i=1;i<=lastSequence;i++){
            console.log(`Processing message: ${i}...`)

            // let msg = await imap.fetchOne(i, { source: true, envelope: true });
            if (i == 1) {
                //console.log(`EMAIL:: ${JSON.stringify(msg)}`)

                let {meta, content} = await imap.download(i);
                console.log('META:', meta)

                let parsed = await simpleParser(content);
                let from = parsed.from.value[0].address.toLowerCase();
                let to = parsed.to.value;
                let attachments = parsed.attachments;

                let approved = await approvedSender(from, emailApprovedSenders)

                if (approved) {
                    console.log('Message:', i, 'Approved Sender.')
                } else {
                    console.log('Message:', i, 'Not an Approved Sender!!!')
                    await badSender(from, emailApprovedSenders)

                    // exit out of the loop for this message.
                    break;
                }
                
                // console.log('PARSED:', from, to, attachments)

                if (attachments.length) {
                    for (let attachment of attachments){
                        console.log(`Writing the attachment [${attachment.filename}]... `)
                        let fileWriter = fs.createWriteStream(attachment.filename)
                        await fileWriter.write(attachment.content)
                        console.log(`Wrote attachment [${attachment.filename}].`)
                    }
                }
                // var jsonContent = JSON.stringify(msg);
                // fs.writeFile("output.json", jsonContent, 'utf8', function (err) {
                //     if (err) {
                //         console.log("An error occured while writing JSON Object to File.");
                //         return console.log(err);
                //     }
                 
                //     console.log("JSON file has been saved.");
                // });
               // content.pipe(fs.createWriteStream(i + "_" + meta.filename));
            }
        }

        // list subjects for all messages
        // uid value is always included in FETCH response, envelope strings are in unicode.

        // let msgCount = 0
        // let messages = await imap.fetch('1:*', { envelope: true });
        // for (let message of imap.fetch('1:*', { envelope: true })) {
        //     msgCount ++

        //     let uid = message.uid
        //     if (msgCount == 1) {
        //         console.log(`EMAIL:: ${JSON.stringify(message)}: FROM:${message.envelope.from} SUBJECT:${message.envelope.subject} \r`);
        //         //await moveMessage(imap, uid, "processed")
        //     }

            
        //     // console.log(`EMAIL:: ${message.uid}: FROM:${message.envelope.from} SUBJECT:${message.envelope.subject} \r`);
        // }

        
    } finally {
        // Make sure lock is released, otherwise next `getMailboxLock()` never returns
        lock.release();
    }

    // log out and close connection
    await imap.logout();
}

async function approvedSender (sender, approvedSenders){
    return approvedSenders.includes(sender)
}

async function badSender (sender, approvedSenders){
    // alert
    // reject
    // move the message
    console.error('TODO:', 'write the badSender() code.')
    return
}

async function moveMessage(imap, uid, destination){
    let options = {uid:true}
    let result = await imap.messageMove(uid, destination, options);
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

