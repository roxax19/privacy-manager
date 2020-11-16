/*-- Librerias -- */

var http = require('http');
var https = require('https');
var fs = require('fs');
var helmet = require('helmet'); //Para HSTS, necesario anadir
var mysql = require('mysql');
var jwt = require('jsonwebtoken');
var express = require('express');
var body_parser = require('body-parser'); //necesario anadir
const axios = require('axios'); // probamos con axios para generar http

/*-- Configuramos Express -- */
var app = express();
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(helmet());
app.disable('etag'); //Para desactivar los caches (evitando respuesta 304 Not Modified)

/*-- Parametros SSL --*/
const options = {
	key     : fs.readFileSync('ssl/key.pem'),
	cert    : fs.readFileSync('ssl/api-rest.pem'),
	dhparam : fs.readFileSync('ssl/dh-strong-key.pem')
};

/*-- Parametros SSL para parte cliente--*/
const agentSSL = new https.Agent({
	key  : fs.readFileSync('ssl/key.pem'),
	cert : fs.readFileSync('ssl/api-rest.pem')
});

/*-- Conexion con la base de datos -- */
var con = mysql.createConnection({
	//host     : '10.152.183.137',
	host     : 'mysql-master.default.svc.cluster.local',
	user     : 'root',
	password : '',
	database : 'test'
});

/*-- Creacion del servidor -- */
const puerto = 8080;
//app.listen(puerto, () => console.log('Servidor http escuchando en puerto ' + puerto));
https.createServer(options, app).listen(puerto, () => console.log('Servidor https escuchando en puerto ' + puerto));

/*-- Respuestas del servidor a GET -- */

app.get('/', function(req, res) {
	console.log('req.query.token: ' + req.query.token);
	console.log('req.query.tipoDato: ' + req.query.tipoDato);

	//Comprobamos que se han introducido los datos necesarios
	if (typeof req.query.token === 'undefined' || typeof req.query.tipoDato === 'undefined') {
		res.send('No se ha introducido token o tipo de dato');
		return;
	}

	//Obtenemos la clase del token que nos han enviado
	comprobarToken(req.query.token)
		.then((clase) => {
			console.log('Clase: ' + clase);
			//Enviamos la clase a priv
			return envioGETPriv(clase, req.query.tipoDato);
		})
		.then((dato) => {
			//Cuando recibimos el dato deseado, lo mostramos por pantalla
			res.send(dato);
			return;
		});
});

/*-- Respuesta del servidor a POST -- */

app.post('/', function(req, res) {
	console.log('req.body.token: ' + req.body.token);
	console.log('req.body.datos: ' + req.body.datos);

	//Comprobamos que se han introducido los datos necesarios
	if (typeof req.body.token === 'undefined' || typeof req.body.datos === 'undefined') {
		res.send('No se ha introducido token o datos');
		return;
	}

	//Comprobamos que la longitud de los datos es correcta
	if (req.body.datos.split(', ').length != 9) {
		res.send('Longitud: ' + req.body.datos.split(', ').length + 'No se han introducido bien los datos');
		return;
	}

	//Obtenemos la clase del token que nos han enviado
	comprobarToken(req.body.token)
		.then((clase) => {
			console.log('Clase: ' + clase);
			//Enviamos la clase a priv junto con los datos
			return envioPOSTPriv(clase, req.body.datos);
		})
		.then((respuesta) => {
			//Cuando recibimos la respuesta la enviamos
			res.send(respuesta);
			return;
		});
});

/*-- Respuesta del servidor a DELETE -- */

app.delete('/', function(req, res) {
	//Borraremos los datos en base al id

	console.log('req.body.token: ' + req.body.token);
	console.log('req.body.id: ' + req.body.id);

	//Comprobamos que se han introducido los datos necesarios
	if (typeof req.body.token === 'undefined' || typeof req.body.id === 'undefined') {
		res.send('No se ha introducido token o id');
		return;
	}

	//Obtenemos la clase del token que nos han enviado
	comprobarToken(req.body.token)
		.then((clase) => {
			console.log('Clase: ' + clase);
			//Enviamos la clase a priv junto con los datos
			return envioDELETEPriv(clase, req.body.id);
		})
		.then((respuesta) => {
			//Cuando recibimos la respuesta la enviamos
			res.send(respuesta);
			return;
		});
});

/**comprobarToken
 * Devuelve:
 * string clase si todo va bien
 * 1 si el token no es valido (hay que implementarlo en auth)
 */
async function comprobarToken(token) {
	//Hacemos una petición a auth, y le pasamos el mensaje.

	var respuesta = '';
	//var auth = 'https://10.152.183.201:8081';
	var auth = 'https://auth.default.svc.cluster.local:8081'

	await axios
		.post(
			auth,
			{
				token : token
			},
			{
				httpsAgent : agentSSL
			}
		)
		.then(function(response) {
			console.log(response.data);
			respuesta = response.data;
		})
		.catch(function(error) {
			console.log(error);
		});

	return respuesta;
}

async function envioGETPriv(clase, tipoDato) {
	//Hay que implementar los distintos metodos segun la funcion que este usando.
	//Por ahora implementamos el GET

	var respuesta = '';
	//var priv = 'https://10.152.183.202:8082';
	var priv = 'https://priv.default.svc.cluster.local:8082';
	var params = {
		clase    : clase,
		tipoDato : tipoDato
	};

	console.log('Params: ' + JSON.stringify(params));

	await axios
		.get(priv, {
			params     : params,
			httpsAgent : agentSSL
		})
		.then(function(response) {
			console.log(response.data);
			respuesta = response.data;
		})
		.catch(function(error) {
			console.log(error);
		});

	return respuesta;
}

async function envioPOSTPriv(clase, datos) {
	//Por ahora implementamos el POST

	var respuesta = '';
	//var priv = 'https://10.152.183.202:8082';
	var priv = 'https://priv.default.svc.cluster.local:8082';
	var params = {
		clase : clase,
		datos : datos
	};

	console.log('Params: ' + JSON.stringify(params));

	await axios
		.post(priv, params, {
			httpsAgent : agentSSL
		})
		.then(function(response) {
			console.log(response.data);
			respuesta = response.data;
		})
		.catch(function(error) {
			console.log(error);
		});

	return respuesta;
}

async function envioDELETEPriv(clase, id) {
	//Por ahora implementamos el DELETE

	var respuesta = '';
	//var priv = 'https://10.152.183.202:8082';
	var priv = 'https://priv.default.svc.cluster.local:8082';
	var data = {
		clase : clase,
		id    : id
	};

	console.log('Params: ' + JSON.stringify(data));

	await axios
		.delete(priv, {
			data       : data,
			httpsAgent : agentSSL
		})
		.then(function(response) {
			console.log(response.data);
			respuesta = response.data;
		})
		.catch(function(error) {
			console.log(error);
		});

	return respuesta;
}
