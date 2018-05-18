const qs = require('querystring');
const url = require('url');
const https = require('https');
const debug = require('debug')('node-google-contacts');
const xml2js = require('xml2js');
const transform = require('./transform');
const HOST = 'www.google.com';
const BASE_PATH = '/m8/feeds/contacts/default/full';

var GoogleContacts = function (credentials) {

    this.contacts = [];
    this.clientId = credentials.clientId ? credentials.clientId : null;
    this.clientSecret = credentials.clientSecret ? credentials.clientSecret : null;
    this.accessToken = credentials.accessToken ? credentials.accessToken : null;
    this.refreshToken = credentials.refreshToken ? credentials.refreshToken : null;
};

GoogleContacts.prototype = {};

GoogleContacts.prototype._request = function (params, cb) {
    var self = this;

    params.method = params.method || 'GET';

    if(params.method === 'GET') {
        if(!params.query) {
            params.query = {};
        }
        params.query.alt = 'json';
    }

    var opts = {
        host: HOST,
        port: 443,
        path: this._buildPath(params),
        method: params.method || 'GET',
        headers: {
            'Authorization': 'OAuth ' + this.accessToken,
            'GData-Version': 3
        }
    };

    if(!params.method === 'GET'){
        opts.headers['content-type'] = 'application/atom+xml';
    }

    if(params.method === 'PUT' || params.method === 'DELETE'){
        opts.headers['If-Match'] = '*';
    }

    debug(req);

    var req = https.request(opts, function (res) {
            var data = '';

            res.on('data', function (chunk) {
                debug('got ' + chunk.length + ' bytes');
                data += chunk.toString('utf-8');
            });

            res.on('error', function (err) {
                cb(err);
            });

            res.on('end', function () {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    var error = new Error('Bad client request status: ' + res.statusCode);
                    return cb(error);
                }
                try {
                    debug(data);
                    if(params.method === 'GET') parseJSON(data, cb);
                    else parseXML(data, cb);
                }
                catch (err) {
                    cb(err);
                }
            });
        })

    if(!(params.method === 'GET'|| params.method === 'DELETE')) {
        req.write(params.payload);
    }

    req.end();

    function parseXML(data, cb){
        var parser = new xml2js.Parser({explicitArray : false});
        parser.parseString(data, function(err, json){
            if(err) return cb(err);

            cb(null, json);
        });
    }

    function parseJSON(data, cb){
        cb(null, JSON.parse(data));
    }
};

GoogleContacts.prototype.list = function (query) {
    var self = this;

    return new Promise(function(resolve, reject) {
        return self._request({query}, function (error, contacts) {

            if (error) return reject(error);
            
            self.contacts = [];
    
            var next = false;
            if(contacts.feed) {
                self.contacts = transform.AtomToSimple(contacts.feed);

                contacts.feed.link.forEach(function (link) {
                    if (link.rel === 'next') {
                        next = true;
                        var path = url.parse(link.href).path;
                        self._request({fullpath: path}, receivedContacts);
                    }
                });
            }

            if (!next) {
                resolve(self.contacts);
            }
        });
    });
};

GoogleContacts.prototype.get = function (id) {
    var self = this;

    return new Promise(function(resolve, reject) {
        return self._request({path: id}, function (error, contact) {
            
            contact = transform.AtomToSimple(contact);
            return error ? reject(error) : resolve(contact);
        });
    });
};

/**
 * Receives an object with @layout and create the contact.
 * Unfortunately google apps do not support contact payload in json
 * format, so we have to convert the object to xml.
 *
 * @see https://developers.google.com/google-apps/contacts/v3/#creating_contacts
 *
 * Object layout: Fot convinience we handle the xml -> js conversion adding the
 * required xml namespaces, so the json object can have a simplified layout (see params).
 *
 * @param contact: uses following format:
 * {
 *   name: {
 *       fullName: 'full contact name'
 *   },
 *   email:[{
 *           primary: true|false,
 *           address: 'email@address.com',
 *           type: 'home|work'
 *       }],
 *   phoneNumber:[{
 *           type: 'home|work|mobile|main|work_fax|home_fax|pager',
 *           phoneNumber: 'phone number'
 *       }]
 * }
 * */
GoogleContacts.prototype.create = function (contact) {
    var self = this;

    var gContact = transform.SimpleToAtom(contact);

    var builder = new xml2js.Builder({rootName:'entry'});
    var payload = builder.buildObject(gContact);

    return new Promise(function(resolve, reject) {
        return self._request({method: 'POST', payload}, function (error, contact) {

            contact = transform.AtomToSimple(contact);
            return error ? reject(error) : resolve(contact);
        });
    });
};

/**
 * Receives an object with @layout and create the contact.
 * Unfortunately google apps do not support contact payload in json
 * format, so we have to convert the object to xml.
 *
 * @see https://developers.google.com/google-apps/contacts/v3/#updating_contacts
 *
 * Object layout: Fot convinience we handle the xml -> js conversion adding the
 * required xml namespaces, so the json object can have a simplified layout (see params).
 *
 * @param contact: uses following format:
 * {
 *   id: 'contact Id',
 *   name: {
 *       fullName: 'full contact name'
 *   },
 *   email:[{
 *           primary: true|false,
 *           address: 'email@address.com',
 *           type: 'home|work'
 *       }],
 *   phoneNumber:[{
 *           type: 'home|work|mobile|main|work_fax|home_fax|pager',
 *           phoneNumber: 'phone number'
 *       }]
 * }
 *
 * The only required property in is id, all the other ones are optional.
 * */
GoogleContacts.prototype.update = function (contact) {
    var self = this;

    return new Promise(function(resolve, reject) {
        if (!contact.id) {
            return reject("Id required");
        }
    
        var gContact = transform.SimpleToAtom(contact);
    
        var builder = new xml2js.Builder({rootName:'entry'});
        var payload = builder.buildObject(gContact);

        return self._request({method: 'PUT', path: contact.id, payload}, function (error, contact) {

            contact = transform.AtomToSimple(contact);
            return error ? reject(error) : resolve(contact);
        });
    });
};

GoogleContacts.prototype.delete = function (id) {
    var self = this;

    return new Promise(function(resolve, reject) {
        return self._request({method: 'DELETE', path: id}, function (error, contact) {
            
            return error ? reject(error) : resolve(contact);
        });
    });
};

GoogleContacts.prototype._buildPath = function (params) {

    if(params.fullpath) {
        path = params.fullpath;
    }

    var path = BASE_PATH;
    if(params.path) path +=  '/' + params.path;
    if (params.method === "GET") path += '?' + qs.stringify(params.query);

    return path;
};

GoogleContacts.prototype.refreshAccessToken = function (refreshToken, params, cb) {
    if (typeof params === 'function') {
        cb = params;
        params = {};
    }

    var data = {
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'

    };

    var body = qs.stringify(data);

    var opts = {
        host: 'accounts.google.com',
        port: 443,
        path: '/o/oauth2/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': body.length
        }
    };

    var req = https.request(opts, function (res) {
        var data = '';
        res.on('end', function () {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                var error = new Error('Bad client request status: ' + res.statusCode);
                return cb(error);
            }
            try {
                data = JSON.parse(data);
                cb(null, data.access_token);
            }
            catch (err) {
                cb(err);
            }
        });

        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('error', cb);

    }).on('error', cb);

    req.write(body);
    req.end();
};

exports.GoogleContacts = GoogleContacts;
