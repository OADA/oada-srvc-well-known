
////////////////////////////////////////////////////////////////////
// This mock server will store all incoming POSTs in memory
// in order to properly respond.  Therefore, if you leave it running
// a long time, it may die.  It is intended to be used for testing,
// not production.
////////////////////////////////////////////////////////////////////

const debuglib = require('debug');
const Promise = require('bluebird');
const express = require('express');
const express_promise = require('express-promise');
const _ = require('lodash');
const cors = require('cors');
const fs = require('fs');
const well_known_json = require('well-known-json');
const oada_error = require('oada-error');
const config = require('./config');
const request = Promise.promisify(require('request'));

return Promise.try(function() {
  // Setup the loggers:
  const log = { 
    info: debuglib('http/info'),
    trace: debuglib('http/trace'),
  };

  opts = opts || {};
  log.info('-------------------------------------------------------------');
  log.info('Starting server for ./well-known/oada-configuration...');

  // Setup express:
  server.app = express();

  // Allow route handlers to return promises:
  server.app.use(express_promise());

  // Log all requests before anything else gets them for debugging:
  server.app.use(function(req, res, next) {
    log.info('Received request: ' + req.method + ' ' + req.url);
    log.trace('req.headers = ', req.headers);
    log.trace('req.body = ', req.body);
    next();
  });

  //----------------------------------------------------------
  // Turn on CORS for all domains, allow the necessary headers
  server.app.use(cors({
    exposedHeaders: [ 'x-oada-rev', 'location' ],
  }));
  server.app.options('*', cors());

  //---------------------------------------------------
  // Configure the OADA well-known handler middleware
  const well_known_handler = well_known_json({
    headers: {
      'content-type': 'application/vnd.oada.oada-configuration.1+json',
    },
  });
  well_known_handler.addResource('oada-configuration', config.get('oada_configuration'));

  //-----------------------------------------------
  // If there are any other internal services who 
  // contribute to well-known-json, go get their
  // version, update for a prefix or subdomain, and
  // merge with existing, then "done" will trigger next 
  // middleware which is the well_known_handler.
  server.app.get(function(req,res,done) {
    const subservices = config.get('mergeSubServices');
    if (_.isArray(subservices)) {
      Promise.map(subservices, function(s) {
        const url = s.base+'/.well-known/oada-configuration';
        return request(url)
        .then(function(res,body) {
          const mergedoc = JSON.parse(body);
          well_known_handler.addResource('oada-configuration', mergedoc);

        // If failed to return, or json didn't parse:
        }).catch(function() {
          log.info('The subservice URL '+url+' failed.');
        });

      // No matter whether we throw or not, let request continue:
      }).finally(function() { done(); });
    }
  });

  // Include well_known_handler AFTER the subservices check:
  server.app.use(well_known_handler);


  //--------------------------------------------------
  // Default handler for top-level routes not found:
  server.app.use(function(req, res){
    throw new oada_error.OADAError('Route not found: ' + req.url, oada_error.codes.NOT_FOUND);
  });

  //---------------------------------------------------
  // Use OADA middleware to catch errors and respond
  server.app.use(oada_error.middleware(console.log));

  server.app.set('port', config.get('server:port');

  //---------------------------------------------------
  // In oada-srvc-docker, the proxy provides the https for us,
  // but this service could also have its own certs and run https
  if(config.get('server:protocol') === 'https://') {
    var s = https.createServer(config.get('server:certs'), server.app);
    s.listen(server.app.get('port'), function() {
      log.info('OADA Well-Known service started on port ' 
               + server.app.get('port')
               + ' [https]');
    });

  //-------------------------------------------------------
  // Otherwise, just plain-old HTTP server
  } else {
    server.app.listen(server.app.get('port'), function() {
      log.info('OADA Test Server started on port ' + server.app.get('port'));
    });
  }
};

