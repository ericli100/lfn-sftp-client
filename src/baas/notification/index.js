"use strict";

/*
    Notifications module
*/

const Slack = require('@slack/webhook');
const slackUrl = process.env.SLACK_WEBHOOK_URL;
const slack = new Slack.IncomingWebhook(slackUrl);

const Teams = require('ms-teams-webhook');
const teamsUrl = process.env.MS_TEAMS_WEBHOOK_URL;
const teams = new Teams.IncomingWebhook(teamsUrl);

let DEBUG = global.DEBUG

function Handler() {
    Handler.sendSlackNotification = async function sendSlackNotification({ baas, VENDOR, ENVIRONMENT, message, correlationId }) {
        // Notify Slack
        try {
            await slack.send({
                text: `[${VENDOR}].[${ENVIRONMENT}] ` + message,
            });

            await baas.audit.log({baas, logger: baas.logger, level: 'info', message: `${VENDOR}: SLACK NOTIFICATION [${ENVIRONMENT}] sent notification [${message}].`, correlationId  })
        
        } catch (notificationError) {
            await baas.audit.log({baas, logger: baas.logger, level: 'error', message: `${VENDOR}: SLACK NOTIFICATION [${ENVIRONMENT}] error message [${ notificationError.toString() }].`, correlationId  })
            return false
        }

        return true
    }

    Handler.sendTeamsNotification = async function sendTeamsNotification({ baas, VENDOR, ENVIRONMENT, message, correlationId }) {
        // Notify Teams
        try {
            await teams.send(JSON.stringify({
                "@type": "MessageCard",
                "@context": "https://schema.org/extensions",
                "summary": "Lineage SFTP",
                "themeColor": "FFBF00",
                "title": `[${VENDOR}].[${ENVIRONMENT}] - Notification`,
                "sections": [
                    {
                        "text": message
                    }
                ]
            }));

            await baas.audit.log({baas, logger: baas.logger, level: 'info', message: `${VENDOR}: TEAMS NOTIFICATION [${ENVIRONMENT}] sent notification [${message}].`, correlationId  })

        } catch (notificationError) {
            await baas.audit.log({baas, logger: baas.logger, level: 'error', message: `${VENDOR}: TEAMS NOTIFICATION [${ENVIRONMENT}] error message [${ notificationError.toString() }].`, correlationId  })
            return false
        }

        return true
    }

    Handler.sendEmailNotification = async function sendEmailNotification({ baas, VENDOR, ENVIRONMENT, subject, message, correlationId }) {
        // Notify Email
        try {
            const client = await baas.email.getClient();
            let recipientsTo = await baas.email.parseEmails( 'baas.notifications@lineagebank.com,admin@lineagebank.com' )
    
            let notificationMessage = {
                subject: `ENCRYPT: BaaS: NOTIFICATION - ${VENDOR}.${ENVIRONMENT} ` + subject,
                body: { contentType: 'Text', content: message },
                toRecipients: recipientsTo,
            }
            let sendEmaileStatus = await baas.email.sendEmail({ client, message: notificationMessage })
            await baas.audit.log({baas, logger: baas.logger, level: 'info', message: `${VENDOR}: EMAIL NOTIFICATION [${ENVIRONMENT}] sent email notification to [${JSON.stringify( recipientsTo )}].`, correlationId  })
        } catch (notificationError) {
            await baas.audit.log({baas, logger: baas.logger, level: 'error', message: `${VENDOR}: EMAIL NOTIFICATION [${ENVIRONMENT}] error message [${ notificationError.toString() }].`, correlationId  })
            return false
        }

        return true
    }

    return Handler
}

module.exports = Handler;