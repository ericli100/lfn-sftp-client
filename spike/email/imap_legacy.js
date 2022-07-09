

let USERNAME= `baas@lineagebank.com`
let PASSWORD= `NOPE`
let SMTP_PORT=587
let SMTP_SERVER=`smtp.office365.com`
let IMAP_PORT=993
let IMAP_SERVER=`outlook.office365.com`

var Imap = require('imap'),
    inspect = require('util').inspect;
 
var imap = new Imap({
  user: USERNAME,
  password: PASSWORD,
  host: IMAP_SERVER,
  port: IMAP_PORT,
  tls: true
});

function openInbox(cb) {
    imap.openBox('INBOX', true, cb);
}

imap.once('ready', function() {
    openInbox(function(err, box) {
      if (err) throw err;
      var f = imap.seq.fetch('1:3', {
        bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
        struct: true
      });
      f.on('message', function(msg, seqno) {
        console.log('Message #%d', seqno);
        var prefix = '(#' + seqno + ') ';
        msg.on('body', function(stream, info) {
          var buffer = '';
          stream.on('data', function(chunk) {
            buffer += chunk.toString('utf8');
          });
          stream.once('end', function() {
            console.log(prefix + 'Parsed header: %s', inspect(Imap.parseHeader(buffer)));
          });
        });
        msg.once('attributes', function(attrs) {
          console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8));
        });
        msg.once('end', function() {
          console.log(prefix + 'Finished');
        });
      });
      f.once('error', function(err) {
        console.log('Fetch error: ' + err);
      });
      f.once('end', function() {
        console.log('Done fetching all messages!');
        imap.end();
      });
    });
  });
   
  imap.once('error', function(err) {
    console.log(err);
  });
   
  imap.once('end', function() {
    console.log('Connection ended');
  });
   
  imap.connect();