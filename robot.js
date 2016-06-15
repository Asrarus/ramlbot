var Fiber = require('fibers');
var _eval = require('eval');
var fs = require('fs');
var http = require('http'), https = require('https');
var URL = require('url');
var Promise = require('any-promise');

module.exports = Robot;

var requester = function (options) {
	var u = URL.parse(options.url);
	var transport = (u.schema == 'http' ? http : https);
	var p = new Promise(function (resolve, reject) {
		var req = http.request({
			hostname: u.hostname,
			port: u.port,
			path: u.path,
			method: options.method,
			headers: options.headers,
		}, function (res) {
			res.on('data', function (d) {
				res.body = (res.body || '') + d;
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

function Robot(script, options) {
	var code = 'module.exports = function (client) {' + 
		'for (var __count__ = 0; __count__ < ' + (options.loop || 1) + '; __count__++) {\n' + 
			fs.readFileSync(script, { encoding: 'UTF-8' }) + '\n' + 
		'}\n' +
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
	this.apiCache = {};
	this.finished = false;
	this.userdata = {}
}

Robot.idseed = 1;
Robot.toquery = function(obj, prefix) {
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

Robot.prototype.run = function () {
	this.fiber.run(this);
}

Robot.prototype.reqopts = function () {
	//TODO: add some header
	return {
		headers: this.options.headers,
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
	if (api.get) {
		promise = api.get(null, this.reqopts());
	}
	else if (api.post) {
		data = (this.options.reqUnparser ? this.options.reqUnparser : JSON.stringify)(data);
		//console.log("body:" + data);
		promise = api.post(data, this.reqopts())
	}
	else {
		throw "invalid api " + path;
	}
	promise.then(function (res) {
		if (self.options.respParser) {
			res.body = self.options.respParser(res.body);
		}
		if (self.options.throwNon200 && res.statusCode != 200) {
			self.fiber.throwInto("http error:" + res.statusCode);
		}
		self.fiber.run(res);
	});
	return Fiber.yield();
}

Robot.prototype.sleep = function (msec) {
	var self = this;
	setTimeout(function () {
		self.fiber.run();
	}, msec);
	Fiber.yield();
}
