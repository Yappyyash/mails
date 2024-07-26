const Imap = require("node-imap");
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 4444;
require('dotenv').config();
const no_messages = 100;

// Middleware for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

function openInbox(imap, cb) {
  imap.openBox("INBOX", true, cb);
}

function isPrintable(str) {
  return /^[\x20-\x7E\s]*$/.test(str);
}

function resch(mailBody) {
  const datePattern = /Re-Scheduled on `(\d{2}\.\d{2}\.\d{4})`/;
  const match = mailBody.match(datePattern);
  return match && match[1] ? match[1] : null;
}

function sch(mailBody) {
  const datePattern = /(\d{2}\.\d{2}\.\d{4})/;
  const match = mailBody.match(datePattern);
  return match && match[1] ? match[1] : null;
}

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/error', (req, res) => {
  res.render('error', { message: 'Invalid credentials' });
});

app.post('/fetch-emails', (req, res) => {
  const imap = new Imap({
    user: req.body.user,
    password: req.body.password,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 3000,
    tlsOptions: { rejectUnauthorized: false }
  });

  let emails = [];

  imap.once("ready", function () {
    openInbox(imap, function (err, box) {
      if (err) {
        console.error('Error opening inbox:', err);
        return res.redirect('/error');
      }
      let f = imap.seq.fetch(`${box.messages.total - no_messages}:${box.messages.total}`, {
        bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)", "1"],
        struct: true
      });

      f.on("message", function (msg, seqno) {
        console.log(`Message #%d`, seqno);
        let prefix = `("` + seqno + `)`;
        let emailData = { from: '', date: '', subject: '', body: '' };

        msg.on("body", function (stream, info) {
          let buffer = "";
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });

          stream.once("end", function () {
            if (info.which === "1") {
              let decodedBody = "";
              decodedBody = Buffer.from(buffer, "base64").toString("utf8");
              emailData.body = isPrintable(decodedBody) ? decodedBody : buffer;
            } else {
              let header = Imap.parseHeader(buffer);
              if (header.from && header.from[0]) {
                emailData.from = header.from[0];
              }
              if (header.date && header.date[0]) {
                emailData.date = header.date[0];
              }
              if (header.subject && header.subject[0]) {
                emailData.subject = header.subject[0];
              }
            }
          });
        });

        msg.once("attributes", function (attrs) {
          if (emailData.subject.includes("Register Yourself")) {
            emailData.body = sch(emailData.body);
          } else if (emailData.subject.includes("Drive Re-Scheduled")) {
            emailData.body = resch(emailData.body);
          } else if (emailData.subject.includes("Fyi : Drive Cancelled")) {
            emailData.body = sch(emailData.body);
          } else return;

          emails.push(emailData);
        });
      });

      f.once("error", function (err) {
        console.log("Fetch error: " + err);
        res.redirect('/error');
      });

      f.once("end", function () {
        console.log("Done fetching all messages!");
        imap.end();
        res.render('index2', { emails });
      });
    });
  });

  imap.once("error", function (err) {
    if (err.textCode === 'AUTHENTICATIONFAILED') {
      console.error('Authentication failed');
      return res.redirect('/error');
    }
    console.error('Connection error:', err);
  });

  imap.once("end", function () {
    console.log("Connection ended");
  });

  imap.connect();
});

app.listen(port, () => {
  console.log(`Running on port localhost:${port}`);
});
