# ramlbot
scriptable bot generated from raml

## setup env
```
npm install raml-client-generator -g
npm install node-gyp -g
npm install --save https://github.com/umegaya/ramlbot.git
npm install --save popsicle
```

## create api sources
```
raml-to-client path/to/api.raml -o api -l javascript
```

## create script
```
touch script.js
cat script.js
//create user
res = client.call('/user/create', {
	device_type: 1,
	user_name: 'robot' + client.id,
});
client.userdata.id = res.body.id;
client.userdata.token = res.body.token;
client.sleep(1000);

//login
res = client.call('/user/login', {
	user_id: client.userdata.id,
	token: client.userdata.token,
});
```

## create entry point
```
touch index.js
cat index.js
var Robot = require('ramlbot');

Robot.runner('./script.js', {
	spawnCount: 100,
	loop: 3,
	API: require('./api'),
	baseUri: "http://api.example.com/v1/",
	codecFactory: function () {
		return {
			decode: JSON.parse,
			encode: JSON.stringify,
		}
	},
	headers: {
		'Content-Type': 'application/json',
	},
});
```

## run it
```
node index.js
```

## advanced. 
1. custom payload codec 
2. custom payload codec: modify/use header
