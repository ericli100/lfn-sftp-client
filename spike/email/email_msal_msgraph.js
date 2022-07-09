// GH ISSUE: https://github.com/LineageBank/lfn-sftp-client/issues/43

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname + "/.env") })

const MSAL_CLIENT_ID = process.env.MSAL_CLIENT_ID;
const MSAL_TENANT_ID = process.env.MSAL_TENANT_ID
const MSAL_USERNAME = process.env.MSAL_USERNAME;
const MSAL_PASSWORD = process.env.MSAL_PASSWORD;

var msal = require("@azure/msal-node");
const { promises: fs } = require("fs");

const { Client } = require("@microsoft/microsoft-graph-client");
require('isomorphic-fetch');

/**
 * Cache Plugin configuration
 */
const cachePath = path.resolve(__dirname + "/data/cache.json"); // Replace this string with the path to your valid cache file.

const beforeCacheAccess = async (cacheContext) => {
    try {
        const cacheFile = await fs.readFile(cachePath, "utf-8");
        cacheContext.tokenCache.deserialize(cacheFile);
    } catch (error) {
        // if cache file doesn't exists, create it
        cacheContext.tokenCache.deserialize(await fs.writeFile(cachePath, ""));
    }
};

const afterCacheAccess = async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
        try {
            await fs.writeFile(cachePath, cacheContext.tokenCache.serialize());
        } catch (error) {
            console.log(error);
        }
    }
};

const cachePlugin = {
    beforeCacheAccess,
    afterCacheAccess
};

const msalConfig = {
    auth: {
        clientId: `${MSAL_CLIENT_ID}`,
        authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
    },
    cache: {
        cachePlugin
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: msal.LogLevel.Verbose,
        }
    }
};

const pca = new msal.PublicClientApplication(msalConfig);
const msalTokenCache = pca.getTokenCache();

async function tokenCalls() {
    let output

    async function getAccounts() {
        return await msalTokenCache.getAllAccounts();
    };

    accounts = await getAccounts();

    // Acquire Token Silently if an account is present
    if (accounts.length > 0) {
        const silentRequest = {
            account: accounts[0], // Index must match the account that is trying to acquire token silently
            scopes: ["user.read"],
            grant_type: `authorization_code`,
        };

        try {
            let response = await pca.acquireTokenSilent(silentRequest)
            output = response
            console.log("\nSuccessful silent token acquisition");
        } catch (err) {
            console.error(err)
        }
    } else { // fall back to username password if there is no account
        const usernamePasswordRequest = {
            scopes: ["user.read"],
            username: MSAL_USERNAME,
            password: MSAL_PASSWORD,
            grant_type: `authorization_code`,
        };

        try {
            let response = await pca.acquireTokenByUsernamePassword(usernamePasswordRequest)
            console.log("acquired token by password grant");
            output = response
        } catch (err) {
            console.error(err)
        }

    }

    return output
}

function getAuthenticatedClient(accessToken) {
    const client = Client.init({
        authProvider: async (done) => {
            // we have already made the call and got the accessToken above
            // since it was just passed in we will replicate the signature 
            // that microsoft wants and return an authenticated client

            // First param to callback is the error,
            // Set to null in success case
            done(null, accessToken);
        }
    })

    return client;
}

async function sendEmail({ client, message }) {
    const sendMail = { message: message};
    return await client.api('/me/sendMail')
        .post(sendMail);
}

async function readEmails({ client, folderId }) {
    if(!folderId){
        let email = await client
        .api('/me/messages')
        .orderby('receivedDateTime desc')
        .get();
        return email.value
    } else {
        let email = await client
        .api(`/me/mailFolders/${folderId}/messages`)
        .orderby('receivedDateTime desc')
        .get();
        return email.value
    }
}

async function readMailFolders({ client, displayName, includeChildren }) {
    // Check Folder .childFolderCount and fetch children recursively.

    // replace the current filter with MS Graph with just an array filter based on the FolderName
    let mailFolders = await client.api('/me/mailFolders').get();

    for( i in mailFolders.value) {
        if(mailFolders.value[i].childFolderCount > 0 && includeChildren){
           let childFolders = await client.api(`me/mailFolders/${mailFolders.value[i].id}/childFolders`).get();
           childFolders.parentFolderName = mailFolders.value[i].displayName;
           mailFolders.value = mailFolders.value.concat(childFolders.value);
        }
    }

    if (displayName) {
        return mailFolders.value.filter( i => i.displayName == displayName );
    } 

    return mailFolders
}

async function moveMailFolder({ client, messageId, destinationFolderId }){
    const message = {
        destinationId: `${destinationFolderId}`
    };
      
    let status = await client.api(`/me/messages/${messageId}/move`)
          .post(message);

    return status
}

// async function readMailChildFolders({ client, folderId }){
//     let mailChildFolders = await client.api(`me/mailFolders/${folderId}/childFolders`)
//         .get();
//     return mailChildFolders.value
// }

async function main() {
    let token = await tokenCalls();
    console.log(token)

    const client = getAuthenticatedClient( token.accessToken )

    let message = { 
        subject: 'Test Message from MS Graph 4', 
        body: { contentType: 'Text', content: 'From Node.js - This is a test message that was sent via the Microsoft Graph API endpoint.' }, 
        toRecipients: [{ emailAddress: { address: 'admins@lineagebank.com' } }], 
    }

    await sendEmail({ client, message })

    let processFoldername = 'rejected'
    let moveToFoldername = 'acknowledged'

    let mailFolders = await readMailFolders({ client, displayName: processFoldername, includeChildren: true })
    console.log(mailFolders)

    let moveToFolder = await readMailFolders({ client, displayName: moveToFoldername, includeChildren: true} )
    console.log(moveToFolder)

    let emails = []
    for(const i in mailFolders) {
        let folderId = mailFolders[i].id
        let mailInFolder = await readEmails({ client, folderId: folderId})

        // mailFolders[i].folderName = mailFolders[i].displayName
        for(const j in mailInFolder) {
            let email = mailInFolder[j]

            // test moving a message to a new folder
            let moveStatus = await moveMailFolder({ client, messageId: email.id, destinationFolderId: moveToFolder[0].id })
            email.folderName = moveToFolder[0].displayName
            emails = emails.concat(email)
        }
    }
    
    console.log(emails)
}

main()

/*
 Graph API Reference Link: https://github.com/microsoftgraph/msgraph-sdk-javascript#via-npm
*/
