const http = require('http');
const fs = require('fs');

var express = require('express');
const multer = require('multer');
var path = require('path');
var bodyParser = require('body-parser');
var debug = require('debug')('index');
const publicIp = require('public-ip');

const upload = multer({ dest: '/tmp/csv/' });

const csv = require('fast-csv');

var emailFinder = require('./lib/email-finder');

var app = express();

process.env.NODE_ENV = process.env.NODE_ENV || 'dev';

var rootDir = path.resolve(__dirname);

app.set('port', process.env.PORT || 5000);

// Configure jade as template engine
app.set('views', rootDir + '/views');
app.set('view engine', 'ejs');
app.set('view options', { layout: false });

// Parse the body
// Warning: http://andrewkelley.me/post/do-not-use-bodyparser-with-express-js.html
// parse application/json
app.use(bodyParser.json());

// Serve static content from "public" directory
app.use(express.static(rootDir + '/public'));

app.get('/', async (req, res) => {
  res.render('index', {
    GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID || '',
    PUBLIC_IP: await publicIp.v4()
  });
});

app.post('/find', function(req, res) {
  var data = {
    name: req.body.first_name.trim() + ' ' + req.body.last_name.trim(),
    domain: req.body.domain
  };

  emailFinder(data)
    .then(function(email) {
      res.send({ email: email });
    })
    .catch(function(err) {
      res.status(500).send(err);
    });
});

app.post('/upload', upload.single('csv'), function(req, res, next) {
  const fileRows = [];

  csv
    .parseFile(req.file.path)
    .on('data', function(data) {
      fileRows.push(data);
    })
    .on('end', function() {
      let working = fileRows.slice(0, 100);
      fs.unlinkSync(req.file.path);
      let resultCsv = [];
      let allPromises = [];
      working.forEach(element => {
        let nameData = {
          name: element[0].trim() + ' ' + element[1].trim(),
          domain: element[2].trim()
        };
        allPromises.push(
          emailFinder(nameData)
            .then(function(email) {
              resultCsv.push([element[0], element[1], element[2], email]);
            })
            .catch(function(err) {
              resultCsv.push([element[0], element[1], element[2], '']);
            })
        );
      });
      Promise.all(allPromises).then(() => {
        csv.writeToString(resultCsv).then(csvString => {
          res.set('Content-Type', 'application/octet-stream');
          res.setHeader(
            'Content-disposition',
            'attachment; filename=emails.csv'
          );
          res.send(csvString);
        });
      });
    });
});

// All set, start listening!
app.listen(app.get('port'), function() {
  console.log(`Server running at http://localhost:${app.get('port')}`);
});
