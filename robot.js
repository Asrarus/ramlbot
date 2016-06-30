var Fiber = require('fibers');
var _eval = require('eval');
var fs = require('fs');
var http = require('http'), https = require('https');
var URL = require('url');
var assign = require('object-assign');
var Promise = require('any-promise');

module.exports = Robot;

var requester = function (options) {
	var u = URL.parse(options.url);
	var transport = (u.schema == 'http' ? http : https);
	if (!options.headers['Content-Length'] && options.body) {
		options.headers['Content-Length'] = options.body.length;
	}
	var p = new Promise(function (resolve, reject) {
		var req = http.request({
			hostname: u.hostname,
			port: u.port,
			path: u.path,
			method: options.method,
			headers: options.headers,
		}, function (res) {
			res.on('data', function (d) {
				//console.log("ondata:" + d.toString('hex'));
				if (!res.body) {
					res.body = d;
				} else {
					res.body = Buffer.concat([res.body, d], res.body.length + d.length);
				}
			})
			res.on('end', function () {
				resolve(res);
			});
		});
		req.on('error', function (err) {
			console.log("err");
			//TODO: reject promise
			reject(err);
		});
		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
	return p;
}

function serialize(obj, prefix) {
  var str = [];
  for(var p in obj) {
    if (obj.hasOwnProperty(p)) {
      var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
      str.push(typeof v == "object" ?
        serialize(v, k) :
        encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
  }
  return str.join("&");	
}

function Robot(script, options) {
	var code = 'module.exports = function (client) {' + 
		'try {\n' + 
			'for (var __count__ = 0; __count__ < ' + (options.loop || 1) + '; __count__++) {\n' + 
				fs.readFileSync(script, { encoding: 'UTF-8' }) + '\n' + 
			'}\n' +
			'client.options.resolve(client, null);\n' + 
		'} catch (e) { client.options.resolve(client, e); throw e; };\n' + 
		'client.finished = true;' +  
	'};';
	//console.log("code = " + code);
	this.id = Robot.idseed++;
	if (!options.API) {
		throw "options.API is required";
	}
	else if (options.API.prototype.request != requester) {
		options.API.prototype.request = requester;
	}
	this.api = new options.API();
	this.fiber = Fiber(_eval(code));
	this.options = options;
	this.options.resolve = this.options.resolve || function (cl, err) {
		if (!err) {
			cl.log("running success");
		} else {
			cl.log("robot running error:" + err.stack);
		}
	}
	this.apiCache = {};
	this.finished = false;
	this.codec = options.codecFactory ? options.codecFactory() : {};
	this.userdata = options.userdataFactory ? options.userdataFactory() : {};
}

Robot.idseed = 1;
Robot.toquery = function(obj) {
	return serialize(obj);
}
Robot.runner = function (script, options) {
	for (var i = 0; i < options.spawnCount; i++) {
		(new Robot(script, options)).run();
	}
}


Robot.prototype.log = function () {
	var params = ""
	if (arguments.length <= 0) {
		return;
	}
	if (arguments.length > 1) {
		var ps = Array.prototype.slice.call(arguments, 1);
		params = " " + JSON.stringify(ps);
	}
	console.log("rb" + this.id + ":" + arguments[0] + params);
}

Robot.prototype.run = function (arg) {
	try {
		this.fiber.run(arg || this);
	} catch (e) {
		console.warn("run robot error:" + e);
	}
}

Robot.prototype.reqopts = function (headers) {
	//TODO: add some header
	return {
		headers: assign(headers || {}, this.options.headers),
		baseUri: this.options.baseUri,
	}
}

Robot.prototype.call = function (path, data) {
	var self = this;
	var api = this.apiCache[path];
	if (!api) {
		api = this.api.resources;
		path.split('/').forEach(function (part) {
			if (part) {
				api = api[part];
				if (!api) {
					throw "no such api " + path;
				}
			}
		});
		this.apiCache[path] = api;
	}
	var promise;
	var headers = assign({}, this.options.headers);
	if (api.get) {
		promise = api.get(null, this.reqopts(headers));
	}
	else if (api.post) {
		data = (this.codec.encode || JSON.stringify)(data, headers, this.userdata);
		//console.log("body:" + data);
		promise = api.post(data, this.reqopts(headers));
	}
	else {
		throw "invalid api " + path;
	}
	promise.then(function (res) {
		if (self.options.throwNon200 && res.statusCode != 200) {
			self.fiber.throwInto(new Error("http error:" + res.statusCode));
		}
		try {
			res.body = (self.codec.decode || JSON.parse)(res.body, res.headers, this.userdata);
			self.run(res);
		} catch (e) {
			self.fiber.throwInto(new Error("parse payload error:" + e.message + " for [" + res.body + "]"));
		}
	}).then(null, function (e) {
		self.fiber.throwInto(e);
	});
	return Fiber.yield();
}

Robot.prototype.sleep = function (msec) {
	var self = this;
	setTimeout(function () {
		self.run();
	}, msec);
	Fiber.yield();
}

Robot.idseed = 1;
Robot.toquery = function(obj) {
	return serialize(obj);
}
Robot.runner = function (script, options) {
	for (var i = 0; i < options.spawnCount; i++) {
		(new Robot(script, options)).run();
	}
}


Robot.prototype.log = function () {
	var params = ""
	if (arguments.length <= 0) {
		return;
	}
	if (arguments.length > 1) {
		var ps = Array.prototype.slice.call(arguments, 1);
		params = " " + JSON.stringify(ps);
	}
	console.log("rb" + this.id + ":" + arguments[0] + params);
}

Robot.prototype.run = function (arg) {
	try {
		this.fiber.run(arg || this);
	} catch (e) {
		console.warn("run robot error:" + e);
	}
}

Robot.prototype.reqopts = function (headers) {
	//TODO: add some header
	return {
		headers: assign(headers || {}, this.options.headers),
		baseUri: this.options.baseUri,
	}
}

Robot.prototype.call = function (path, data) {
	var self = this;
	var api = self.apiCache[path];
	if (!api) {
		api = self.api.resources;
		path.split('/').forEach(function (part) {
			if (part) {
				api = api[part];
				if (!api) {
					throw "no such api " + path;
				}
			}
		});
		self.apiCache[path] = api;
	}
	var promise;
	var headers = assign({}, self.options.headers);
	if (api.get) {
		promise = api.get(null, self.reqopts(headers));
	}
	else if (api.post) {
		data = (self.codec.encode || JSON.stringify)(data, api, headers, self.userdata);
		//console.log("body:" + data);
		promise = api.post(data, self.reqopts(headers));
	}
	else {
		throw "invalid api " + path;
	}
	promise.then(function (res) {
		if (self.options.throwNon200 && res.statusCode != 200) {
			self.fiber.throwInto(new Error("http error:" + res.statusCode));
		}
		try {
			res.body = (self.codec.decode || JSON.parse)(res.body, api, res.headers, self.userdata);
			self.run(res);
		} catch (e) {
			self.fiber.throwInto(new Error("parse payload error:" + e.message + " for [" + res.body + "]"));
		}
	}).then(null, function (e) {
		self.fiber.throwInto(e);
	});
	return Fiber.yield();
}

Robot.prototype.sleep = function (msec) {
	var self = this;
	setTimeout(function () {
		self.run();
	}, msec);
	Fiber.yield();
}
