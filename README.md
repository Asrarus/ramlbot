# ramlbot
scriptable bot generated from raml

## setup modules
```
npm install raml-client-generator -g
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

(new Robot('./scripts.js', {
	API: require('./api'),
	baseUri: "http://api.example.com/v1/",
	respParser: JSON.parse,
	reqUnparser: JSON.stringify,
	headers: {
		'Content-Type': 'application/json',
	},
	loop: 1,
})).run();
```

## run it
```
node index.js
```
