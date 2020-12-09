/*-- Librerias -- */

var https = require('https');
var fs = require('fs');
var helmet = require('helmet'); //Para HSTS, necesario anadir
var mysql = require('mysql');
var jwt = require('jsonwebtoken');
var express = require('express');
var body_parser = require('body-parser'); //necesario anadir
const util = require('util'); // Para "promisify" las querys
var Promise = require('bluebird'); //Para numeros aleatorios
var randomNumber = require('random-number-csprng'); //Para numeros aleatorios
const axios = require('axios'); // probamos con axios para generar http

/*-- Configuramos Express -- */
var app = express();
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(helmet());
app.disable('etag'); //Para desactivar los caches (evitando respuesta 304 Not Modified)

/*-- Parametros SSL --*/
const options = {
	key                : fs.readFileSync('ssl/key.pem'),
	cert               : fs.readFileSync('ssl/priv.pem'),
	dhparam            : fs.readFileSync('ssl/dh-strong-key.pem')
	//Condiciones para el cliente:
	//requestCert        : true,
	//rejectUnauthorized : true
};

/*-- Parametros SSL para parte cliente--*/
const agentSSL = new https.Agent({
	key  : fs.readFileSync('ssl/key.pem'),
	cert : fs.readFileSync('ssl/priv.pem')
});

/*-- Conexion con la base de datos (hecha con "factory function" warper para usar await)-- */
var dbConfig = {
	//host     : '10.152.183.137', //mysql master
	host     : 'mysql-master.default.svc.cluster.local',
	user     : 'root',
	password : '',
	database : 'test'
};

function makeDb(config) {
	const connection = mysql.createConnection(config);
	return {
		query(sql, args) {
			return util.promisify(connection.query).call(connection, sql, args);
		},
		close() {
			return util.promisify(connection.end).call(connection);
		}
	};
}

var con = makeDb(dbConfig);

/*-- Creacion del servidor -- */
const puerto = 8082;
//app.listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto));
https.createServer(options, app).listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto));

/*-- Respuesta del servidor a GET -- */

app.get('/', function(req, res) {
	//Tengo que leer las normas de privacidad

	console.log('Priv: ' + JSON.stringify(req.query));

	tipoAccesoGET(req.query.clase, 'GET', req.query.tipoDato).then((acceso) => {
		if (acceso == 'none') {
			res.send('No tienes acceso al dato.');
		} else if (acceso == 'exact') {
			//Hacemos query a la base directamente
			query(req.query.tipoDato)
				.then((resultado) => {
					res.send(resultado);
				})
				.catch((err) => {
					console.log(err);
					res.send(err);
				});
		} else if (acceso == 'gen') {
			//var gen = 'https://10.152.183.203:8083';
			var gen = 'https://gen.default.svc.cluster.local:8083';
			
			//Hacemos llamada al modulo de generalizar
			axios
				.get(gen, { httpsAgent: agentSSL })
				.then((response) => {
					console.log(response.data);
					res.send(response.data);
				})
				.catch(function(error) {
					console.log(error);
				});
		} else if (acceso == 'minNoise') {
			//Hacemos llamada a la función de ruido
			query(req.query.tipoDato)
				.then((resultado) => {
					return ruido(resultado, 'personas', 0.1);
				})
				.then((resultadoRuido) => {
					res.send(resultadoRuido);
				})
				.catch((err) => {
					console.log(err);
					res.send(err);
				});
		} else if (acceso == 'medNoise') {
			//Hacemos llamada a la función de ruido
			query(req.query.tipoDato)
				.then((resultado) => {
					return ruido(resultado, 'personas', 0.5);
				})
				.then((resultadoRuido) => {
					res.send(resultadoRuido);
				})
				.catch((err) => {
					console.log(err);
					res.send(err);
				});
		} else if (acceso == 'maxNoise') {
			//Hacemos llamada a la función de ruido
			query(req.query.tipoDato)
				.then((resultado) => {
					return ruido(resultado, 'personas', 1);
				})
				.then((resultadoRuido) => {
					res.send(resultadoRuido);
				})
				.catch((err) => {
					console.log(err);
					res.send(err);
				});
		} else {
			res.send('Error en priv, tipoAcceso');
		}
	});
});

/*-- Respuesta del servidor a POST -- */

app.post('/', function(req, res) {
	console.log('req.body.clase: ' + req.body.clase);
	console.log('req.body.datos: ' + req.body.datos);

	//HACER COMPROBACION DE LA LONGITUD DE LOS DATOS EN API-REST
	//LA COMPROBACION DEL FORMULARIO NO ES EL OBJETIVO DE ESTE TFG

	//Vemos si tenemos permiso para introducir datos
	tipoAccesoAccion(req.body.clase, 'POST').then((resultado) => {
		//Si devuelve 0, introducimos los datos en la tabla
		if (resultado == 0) {
			introduzcoDatos(req.body.datos)
				.then((resultado) => {
					console.log(resultado);
					res.send(resultado);
				})
				.catch((err) => {
					console.log(err);
				});
		} else {
			res.send('No tienes permiso para hacer POST');
		}
	});
});

// /*-- Respuesta del servidor a DELETE -- */

app.delete('/', function(req, res) {
	console.log('req.body.clase: ' + req.body.clase);
	console.log('req.body.datos: ' + req.body.id);

	//Vemos si tenemos permiso para introducir datos
	tipoAccesoAccion(req.body.clase, 'DELETE').then((resultado) => {
		//Si devuelve 0, borramos los datos de la tabla
		if (resultado == 0) {
			borroDatos(req.body.id)
				.then((resultado) => {
					console.log(resultado);
					res.send(resultado);
				})
				.catch((err) => {
					console.log(err);
				});
		} else {
			res.send('No tienes permiso para hacer DELETE');
		}
	});
});

/**
 * Mira el tipo de acceso que tenemos
 * @param {string} clase 
 * @param {string} accion 
 * @param {string} tipoDato 
 * 
 * Devuelve:
 * "none" si no tenemos acceso
 * "exact" si devolvemos el dato sin ninguna privacidad
 * "gen" si devolvemos una generalizacion del dato (usado para strings)
 * "noise" si devolvemos el dato con algun tipo de ruido
 */

async function tipoAccesoGET(clase, accion, tipoDato) {
	console.log('fun tipoAcceso clase: ' + clase);
	console.log('fun tipoAcceso tipoDato: ' + tipoDato);

	var politica = fs.readFileSync('politicas/' + clase + '.json');
	var jsonPolitica = JSON.parse(politica);

	console.log('fun tipoAcceso politica: ' + JSON.stringify(jsonPolitica));

	var boolAccion = 0;
	var boolTipoDato = 0;

	var result = '';

	/**Condiciones para acceso:
	 * Puede hacer la accion
	 * Puede acceder al dato con esa accion
	 */


	var i = 0;
	while (i < jsonPolitica.max && result == '') {
		//Comprobamos las acciones
		for (const accionRegla of jsonPolitica.reglas[i].action) {
			console.log('fun tipoAcceso accionRegla: ' + accionRegla);
			if (accionRegla == accion) {
				//Se permite la accion
				boolAccion = 1;
			}
		}

		for (const datoRegla of jsonPolitica.reglas[i].data) {
			console.log('fun tipoAcceso datoRegla: ' + datoRegla);
			if (datoRegla == tipoDato || datoRegla == 'all') {
				//Se permite la accion
				boolTipoDato = 1;
			}
		}

		if (boolAccion && boolTipoDato) {
			result = jsonPolitica.reglas[i].privacyMethod[0];
		} else {
			boolAction = 0;
			boolTipoDato = 0;
			i++;
		}
	}

	if (result == '') {
		result = 'none';
	}
	console.log('fun tipoAcceso devuelve: ' + result);
	return result;
}

async function tipoAccesoAccion(clase, accion) {
	console.log('fun tipoAccesoAccion clase: ' + clase);

	var politica = fs.readFileSync('politicas/' + clase + '.json');
	var jsonPolitica = JSON.parse(politica);

	console.log('fun tipoAcceso politica: ' + JSON.stringify(jsonPolitica));

	var boolAccion = 0;

	var i = 0;
	while (i < jsonPolitica.max && boolAccion == 0) {
		for (const accionRegla of jsonPolitica.reglas[i].action) {
			console.log('fun tipoAccesoAccion accionRegla: ' + accionRegla);
			if (accionRegla == accion) {
				//Se permite la accion
				boolAccion = 1;
				return 0;
			}
		}
		i++;
	}

	return 1;
}

async function query(tipoDato) {
	//Cogemos una fila de la base de datos

	var dato = traduccionTipoDato(tipoDato);

	try {
		var resultado = await con.query('SELECT ' + dato + ' FROM `personas`');
	} catch (err) {
		console.log(err);
	}

	console.log('fun query result: ' + resultado);
	return resultado;
}

function traduccionTipoDato(tipoDato) {
	if (tipoDato == 'all') {
		return '*';
	} else if (tipoDato == 'personales') {
		return 'nombre, edad';
	} else if (tipoDato == 'localizacion') {
		return 'lat, lon';
	} else if (tipoDato == 'profesion') {
		return 'profesion, sueldo';
	} else if (tipoDato == 'salud') {
		return 'pulso, temperatura, enfermedad';
	} else {
		return 'error';
	}
}

async function introduzcoDatos(datos) {
	var datosTroceados = datos.split(', ');

	console.log(datos);
	console.log(datosTroceados);

	try {
		var resultado = await con.query(
			'INSERT INTO personas (nombre, edad, lat, lon, profesion, sueldo, pulso, temperatura, enfermedad) VALUES (?,?,?,?,?,?,?,?,?)',
			datosTroceados
		);
	} catch (err) {
		console.log(err);
		console.log(query.sql);
	}

	console.log('fun query result: ' + resultado);
	return resultado;
}

async function borroDatos(id) {
	try {
		var resultado = await con.query('DELETE FROM personas WHERE id=?', id);
	} catch (err) {
		console.log(err);
		console.log(query.sql);
	}

	console.log('fun query result: ' + resultado);
	return resultado;
}

/**
 *
 * 
 * @param {json} queryJson
 * @param {string} tabla
 * 
 * Devuelve:
 * objeto json modificado con ruido
 */
async function ruido(queryJson, tabla, factor) {
	console.log('me meto en ruido');

	//Por cada fila de la consulta:
	for (i in queryJson) {
		//Eliminamos la fila de id porque no nos interesa
		delete queryJson[i]['id'];

		//Deberiamos leer la ontología, y dependiendo del tipo de variable que sea añadirle el ruido definido en la ontología

		//Leemos el json de la ontologia
		let rawdata = fs.readFileSync('ontologia/ontologia.json');
		let ontologia = JSON.parse(rawdata);

		//Hacemos un bucle por la fila de la tabla
		//Con for in iteramos sobre las claves de un json
		for (keyTabla in queryJson[0]) {
			//Busco esta key en la ontología. Recordemos que en la ontología hay niveles.
			//Buscamos dentro de perosnas porque es la tabla en la que estamos buscando
			for (key1 in ontologia[tabla]) {
				for (key2 in ontologia[tabla][key1]) {
					if (key2 == keyTabla) {
						//Si es un string, sustituimos el valor por "*"
						if (ontologia[tabla][key1][key2].type == 'string') {
							queryJson[i][keyTabla] = '*';
						}
						//Si es un numero, le anadimos el ruido
						if (ontologia[tabla][key1][key2].type == 'number') {
							//Generamos el número aleatorio seguro

							numberGenerator = Promise.try(function() {
								return randomNumber(
									ontologia[tabla][key1][key2].maxNoise * factor * -100,
									ontologia[tabla][key1][key2].maxNoise * factor * 100
								);
							})
								.then(function(number) {
									queryJson[i][keyTabla] = queryJson[i][keyTabla] + number / 100;
								})
								.catch({ code: 'RandomGenerationError' }, function(err) {
									console.log('Something went wrong!');
								});

							await numberGenerator;
						}
					}
				}
			}
		}
	}

	return queryJson;
}
