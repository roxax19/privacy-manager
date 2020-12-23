/* ===================================== Librerias ===================================== */

const https = require('https')
const fs = require('fs')
const path = require('path')
const helmet = require('helmet') //Para HSTS, necesario anadir
const mysql = require('mysql')
const jwt = require('jsonwebtoken')
const express = require('express')
const body_parser = require('body-parser') //necesario anadir
const util = require('util') // Para "promisify" las querys
const Promise = require('bluebird') //Para numeros aleatorios
const randomNumber = require('random-number-csprng') //Para numeros aleatorios
const axios = require('axios') // probamos con axios para generar http
const QueryString = require('qs')

/* ===================================== Configuramos Express ===================================== */
var app = express()
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(helmet())
app.disable('etag') //Para desactivar los caches (evitando respuesta 304 Not Modified)

/* ===================================== Parametros SSL ===================================== */
const options = {
	key     : fs.readFileSync('ssl/key.pem'),
	cert    : fs.readFileSync('ssl/priv.pem'),
	dhparam : fs.readFileSync('ssl/dh-strong-key.pem'),
	ca      : fs.readFileSync('ssl/myCA.key')
	//Condiciones para el cliente:
	//requestCert        : true,
	//rejectUnauthorized : true
}

/* ================================= Parametros SSL para parte cliente ================================= */
const agentSSL = new https.Agent({
	key  : fs.readFileSync('ssl/key.pem'),
	cert : fs.readFileSync('ssl/priv.pem')
})

const agent = new https.Agent({})

/* ================== Conexion con la base de datos (hecha con "factory function" warper para usar await) ================== */
var dbConfig = {
	host     : '10.152.183.137', //mysql master
	//host   : 'mysql-master.default.svc.cluster.local',
	user     : 'root',
	password : '',
	database : 'test'
}

function makeDb(config) {
	const connection = mysql.createConnection(config)
	return {
		query(sql, args) {
			return util.promisify(connection.query).call(connection, sql, args)
		},
		close() {
			return util.promisify(connection.end).call(connection)
		}
	}
}

var con = makeDb(dbConfig)

/* ===================================== Direcciones de modulos ===================================== */
// -- HTTPS --
//var gen = 'https://10.152.183.203:8083'
//var gen = 'https://gen.default.svc.cluster.local:8083';

// -- HTTP --
var gen = 'http://10.152.183.203:8083'

/* ===================================== Creacion del servidor ===================================== */
const puerto = 8082
//app.listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto));
https.createServer(options, app).listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto))

/* ===================================== Lectura reglas privacidad ===================================== */

/**
 * Hacemos una lectura inicial de todas las politicas acutales y creamos una view de sql para cada regla get de cada usuario.
 * Luego en cada get que recibimos comprobamos si la query y el filter de las políticas han cambiado. Si han cambiado,
 * borramos la view que existe para ese usuario, y creamos una nuvea. Eso debería ser una función a parte.
 * 
 * SQL no puede hacer una query con columnas que no existen en la view. Por eso, cada vez que creemos una view necesitamos
 * almacenar en un array las columnas que tiene esa view, para luego poder hacer una comparación con las que solicita el usuario
 * y meter en la query que hacemos en la base de datos solo las que existan dentro de la view
 */

const privacyRulesPath = path.join(__dirname, 'politicas')
var politics = {}
var politicsAsRead = {}
updateRules()

/* ===================================== GET ===================================== */

app.get('/', async function(req, res) {
	//console.log('Priv: ' + JSON.stringify(req.query));

	//HAY QUE CAMBIAR EL PARÁMETRO TIPO DATO A QUERY STRING --> EN TODOS LOS MODULOS

	//TENEMOS PENDIENTE CONTROLAR EL ACCESO? QUE SE DEVUELVE EN CASO DE QUE NO TENGA PERMISO? ME VALE DEVOLVER NADA

	try {
		//Tenemos que combrobar si las reglas de privacidad han cambiado, y si han cambiado actualizarlas
		await updateRules()

		//Despues realizamos las querys a las diferentes vistas que tenga el usuario disponibles
		var datos = await querysAVistas(req.query.clase, req.query.stringQuery)

		//Ahora enviamos los datos a cada funcion segun el metodo asignado
		var datosProcesados = await procesarDatos(datos)

		res.send(datosProcesados)
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== POST ===================================== */

app.post('/', async function(req, res) {
	console.log('req.body.clase: ' + req.body.clase)
	console.log('req.body.datos: ' + req.body.datos)

	try {
		//Tenemos que combrobar si las reglas de privacidad han cambiado, y si han cambiado actualizarlas
		await updateRules()

		//Vemos si tenemos permiso para introducir los datos
		//HABRA QUE CAMBIAR PARA ADAPTARLO A LAS NUEVAS REGLAS
		var acceso = await tipoAccesoAccion(req.body.clase, 'PUSH')

		if (acceso == 0) {
			var respQuery = await introduzcoDatos(req.body.datos)
			console.log(respQuery)
			res.send(respQuery)
		}
		else {
			res.send('No puede introducir datos')
		}
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== DELETE ===================================== */

app.delete('/', async function(req, res) {
	console.log('req.body.clase: ' + req.body.clase)
	console.log('req.body.datos: ' + req.body.id)

	try {
		//Tenemos que combrobar si las reglas de privacidad han cambiado, y si han cambiado actualizarlas
		await updateRules()

		//Vemos si tenemos permiso para introducir los datos
		//HABRA QUE CAMBIAR PARA ADAPTARLO A LAS NUEVAS REGLAS
		var acceso = await tipoAccesoAccion(req.body.clase, 'DELETE')

		if (acceso == 0) {
			var respQuery = await borroDatos(req.body.id)
			console.log(respQuery)
			res.send(respQuery)
		}
		else {
			res.send('No puede eliminar datos')
		}
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== Funciones ===================================== */

/**
 * 
 * @param {String} clase 
 * @param {String} accion 
 * 
 * Comprueba si hay alguna regla con la accion solicitada para la clase
 * 
 * Devuelve: 0 si hay acceso, 1 si no hay acceso
 */
async function tipoAccesoAccion(clase, accion) {
	//Comprobamos si tenemos permiso para hacer PUSH o DELETE

	for (var i = 0; i < politics[clase].rules.length; i++) {
		if (politics[clase].rules[i].action_type == accion) {
			//Si tenemos permiso, devolvemos 0
			return 0
		}
	}

	//Si no hemos encontrado ninguna regla con permiso, devolvemos 1
	return 1
}

/**
 * 
 * @param {String} datos 
 * 
 * Almacena los datos introducidos por el usuario mediante la API en la base de datos
 * 
 * Devuelve: La respuesta de la base de datos
 */
async function introduzcoDatos(datos) {
	var datosTroceados = datos.split(', ')

	try {
		var resultado = await con.query(
			'INSERT INTO personas (nombre, edad, lat, lon, profesion, sueldo, pulso, temperatura, enfermedad) VALUES (?,?,?,?,?,?,?,?,?)',
			datosTroceados
		)
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}

	console.log('fun query result: ' + resultado)
	return resultado
}

/**
 * 
 * @param {Number} id 
 * 
 * Elimina la fila con el id determinado por el usuario
 * 
 * Devuelve: La respuesta de la base de datos
 */
async function borroDatos(id) {
	try {
		var resultado = await con.query('DELETE FROM personas WHERE id=?', id)
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}

	console.log('fun query result: ' + resultado)
	return resultado
}

/**
 *
 * 
 * @param {json} queryJson
 * @param {string} tabla
 * @param {string} fator
 * 
 * Devuelve: objeto json modificado con ruido
 */
async function ruido(queryJson, tabla, factor) {
	// console.log('me meto en ruido');

	//Por cada fila de la consulta:
	for (i in queryJson) {
		//Eliminamos la fila de id porque no nos interesa
		//delete queryJson[i]['id']

		//Deberiamos leer la ontología, y dependiendo del tipo de variable que sea añadirle el ruido definido en la ontología

		//Leemos el json de la ontologia
		let rawdata = fs.readFileSync('ontologia/ontologia.json')
		let ontologia = JSON.parse(rawdata)

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
							queryJson[i][keyTabla] = '*'
						}
						//Si es un numero, le anadimos el ruido
						if (ontologia[tabla][key1][key2].type == 'number') {
							//Generamos el número aleatorio seguro

							numberGenerator = Promise.try(function() {
								return randomNumber(
									ontologia[tabla][key1][key2].maxNoise * factor * -100,
									ontologia[tabla][key1][key2].maxNoise * factor * 100
								)
							})
								.then(function(number) {
									queryJson[i][keyTabla] = queryJson[i][keyTabla] + number / 100
								})
								.catch({ code: 'RandomGenerationError' }, function(err) {
									console.log('Something went wrong!')
								})

							await numberGenerator
						}
					}
				}
			}
		}
	}

	return queryJson
}

/**
 * 
 * @param {*} rule 
 * @param {*} nombreArchivo 
 * @param {*} iteracion 
 * 
 * Crea una view en la base de datos con la regla pasada por parámetro
 *  
 * Devuelve: el nombre de la vista creada
 */
async function createViewFromRule(rule, nombreArchivo, iteracion) {
	var stringQuery = 'CREATE OR REPLACE VIEW personas_' + nombreArchivo + '_' + iteracion + ' AS ' + rule.resource

	if (!(rule.filter === undefined)) {
		stringQuery = stringQuery + ' ' + rule.filter
	}

	//Realizamos las querys
	try {
		var resultado = await con.query(stringQuery)
	} catch (err) {
		console.log(err)
	}

	return 'personas_' + nombreArchivo + '_' + iteracion
}

async function createViewFromViewColumns(rule, clase, iteracion) {
	var stringQuery = 'CREATE OR REPLACE VIEW personas_' + clase + '_' + iteracion + ' AS '

	//Creamos la parte del SELECT
	var stringSelect = 'SELECT '

	//Añadimos las columnas
	for (var i = 0; i < rule.viewColumns.length; i++) {
		stringSelect = stringSelect + rule.viewColumns[i] + ', '
	}

	//Quitamos la ultima coma y espacio, y completamos
	stringSelect = stringSelect.slice(0, -2)
	stringSelect = stringSelect + ' FROM personas'

	//y añadimos
	stringQuery = stringQuery + stringSelect

	//Si tiene filtro, lo añadimos
	if (!(rule.filter === undefined)) {
		stringQuery = stringQuery + ' ' + rule.filter
	}

	//Realizamos las querys
	try {
		var resultado = await con.query(stringQuery)
	} catch (err) {
		console.log(err)
	}

	//Y devolvemos el nombre de la vista
	return 'personas_' + clase + '_' + iteracion
}

/**
 * 
 * @param {String} claseUsuario 
 * @param {String} queryUsuario 
 * 
 * Realiza las querys a las vistas que tiene disponibles el usuario,
 * en funcion del metodo de privacidad que puede utilizar
 * 
 * Devuelve: un array de jsons con formato {privacy_method:____, resultados:____}
 */
async function querysAVistas(claseUsuario, queryUsuario) {
	/**
	 * Vamos a dejar una vista por cada regla GET, y dentro de nuestro objeto regla introducimos un array
	 * de columnas que son las que se definen en esa regla.
	 * 
	 * A la hora de hacer las querys a las vistas, tenemos que controlas los * que representan a todas las columnas,
	 * tanto en el usuario como las que hay almacenadas en el campo reglas.columnas
	 * 
	 */

	//Formato query usuario : SELECT _____ FROM _____ WHERE _____

	//Quiero modificar la tabla que el usuario solicita por la vista a la que realmente puede acceder
	//Tengo que hacer una query por cada regla con GET que tenga el usuario definida

	var resultadoFinal = []
	var queryUsuarioArray = queryUsuario.split(' ')

	//Por cada regla con GET
	for (var i = 0; i < politics[claseUsuario].rules.length; i++) {
		if (politics[claseUsuario].rules[i].action_type == 'GET') {
			//Monto la query

			var queryString = ''
			var indexFrom = queryUsuarioArray.indexOf('FROM')

			//Hacemos cosas distintas en funcion de la posición de la query en la que estemos
			var j = 0

			// ----- SELECT ------
			queryString = queryString + queryUsuarioArray[0] + ' '

			// ----- COLUMNAS -----
			if (politics[claseUsuario].rules[i].viewColumns[0] == '*') {
				//Si en las reglas hay un *, dejamos la query del usuario

				//Primero quitamos la , que pueda quedar en la query del usuario
				queryUsuarioArray[j] = queryUsuarioArray[j].replace(',', '')

				//Si en las reglas hay un *, podemos dejar la query del usuario como esta añadiendole la columna id
				for (j = 1; j < indexFrom; j++) {
					queryString = queryString + queryUsuarioArray[j] + ', '
				}
				queryString = queryString + 'id '
			}
			else if (queryUsuarioArray[1] == '*') {
				//Si en el usuario hay un *, podemos realizar esta query
				queryString = queryString + queryUsuarioArray[1] + ' '
			}
			else {
				//Si hay columnas en el usuario y en las reglas, tenemos que hacer la comparacion
				for (j = 1; j < indexFrom; j++) {
					//Primero quitamos la , que pueda quedar en la query del usuario
					queryUsuarioArray[j] = queryUsuarioArray[j].replace(',', '')
					//Luego comparamos
					politics[claseUsuario].rules[i].viewColumns.forEach((element) => {
						if (element == queryUsuarioArray[j]) {
							//Si coincide alguna columna, la ponemos dentro de la query
							queryString = queryString + queryUsuarioArray[j] + ', '
						}
					})
				}
				//Añadimos id
				queryString = queryString + 'id '
			}

			// ----- FROM -----
			queryString = queryString + queryUsuarioArray[indexFrom] + ' '

			// ----- NOMBRE DE LA TABLA -----
			//Hay que cambiarlo por el nombre de la vista
			queryString = queryString + politics[claseUsuario].rules[i].viewName + ' '

			// ----- WHERE Y CONDICIONES -----
			//Lo dejamos igual
			for (j = indexFrom + 2; j < queryUsuarioArray.length; j++) {
				queryString = queryString + queryUsuarioArray[j] + ' '
			}

			//Una vez que esta montada la query, la enviamos a la base de datos

			console.log('querys que se mandan: ' + queryString)

			try {
				var resultado = await con.query(queryString)
			} catch (err) {
				console.log(err)
			}

			resultadoFinal.push({
				privacy_method : politics[claseUsuario].rules[i].privacy_method,
				datosSQL       : resultado
			})
		}
	}

	return resultadoFinal
}

/**
 * 
 * @param {String} queryString //query almacenada en las reglas
 * 
 * Devuelve: un array con las columnas despues del SELECT
 */
async function obtainViewColumns(queryString) {
	var queryStringArray = queryString.split(' ')
	var resultado = []

	//Si la segunda palabra es un *, lo guardamos y lo devolvemos directamente
	if (queryStringArray[1] == '*') {
		resultado.push('*')
	}
	else {
		//Si no es un *, tenemos que quedarnos con las posiciones 1 hasta FROM

		var exit = 0
		var i = 1
		while (i < queryStringArray.length && exit == 0) {
			if (queryStringArray[i] == 'FROM') {
				exit = 1
			}
			else {
				resultado.push(queryStringArray[i].replace(',', ''))
				i++
			}
		}
	}

	//Añadimos la columna ID para poder juntar despues los datos de personas de diferentes metodos
	resultado.push('id')

	return resultado
}

/**
 * 
 * @param {Array} datos 
 * La estructura de datos es: [{privacy_method:________, datosSQL:_________},{},{}]
 * 
 * Devuelve:
 */
async function procesarDatos(datos) {
	/**
	 * Tenemos que procesar los datos en funcion de su privacy_method.
	 * Lo ideal seria juntar mediante el id los datos de privacidad que afecten solo a una persona
	 * Los que hagan agrupaciones de personas, se devolverán a parte
	 * 
	 * Ahora mismo, vamos a probar a procesarlos simplemente, y cuando eso funcione, los intentamos juntar por id
	 * 
	 */

	//Para esta modificacion, tendriamos que guardar los datos procesados tambien con el metodo que los ha procesado.
	//Asi, si el metodo seleccionado solo afecta a las columnas, debemos juntar esos datos mediante la id
	//Y luego finalmente, si queremos, quitra la id como se hacia en lo de ruido

	var datosProcesados = []
	var datosAux = [] //Array donde mezclaremos los datos
	var resultado = []

	for (var i = 0; i < datos.length; i++) {
		if (datos[i].privacy_method == 'Exact') {
			//No hacemos nada, los devolvemos tal cual
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : datos[i].datosSQL
			})
		}
		else if (datos[i].privacy_method == 'MinNoise') {
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : await ruido(datos[i].datosSQL, 'personas', 0.1)
			})
		}
		else if (datos[i].privacy_method == 'MedNoise') {
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : await ruido(datos[i].datosSQL, 'personas', 0.5)
			})
		}
		else if (datos[i].privacy_method == 'MaxNoise') {
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : await ruido(datos[i].datosSQL, 'personas', 1)
			})
		}
		else if (datos[i].privacy_method == 'Generalization') {
			//Hacemos llamada al modulo de generalizar
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				var response = await axios.get(gen)
				datosProcesados.push({
					privacy_method  : datos[i].privacy_method,
					datosProcesados : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
	}

	// //Ahora juntamos los que se pueda por id
	// var primero = 1
	// for (var i = 0; i < datosProcesados.length; i++) {
	// 	if (
	// 		datosProcesados[i].privacy_method == 'Exact' ||
	// 		datosProcesados[i].privacy_method == 'MinNoise' ||
	// 		datosProcesados[i].privacy_method == 'MedNoise' ||
	// 		datosProcesados[i].privacy_method == 'MaxNoise'
	// 	) {
	// 		//Se puede juntar
	// 		if (primero) {
	// 			//Como es el primer array, hacemos un push normal
	// 			datosAux = datosProcesados[i].datosProcesados //almacena [{id,nombre...}{...}{...}{...}]
	// 			primero = 0
	// 		}
	// 		else {
	// 			//Como no es el primer array, hay que ir combinandolos segun id.
	// 			//Tengo que hacer un loop entre los dos array
	// 			for (var j = 0; datosAux.length; j++) {
	// 				console.log("datosProcesados: "+JSON.stringify(datosProcesados[i]))
	// 				console.log("datosAux: "+JSON.stringify(datosAux))
	// 				//for (var k = 0;datosAux)

	// 				if (datosProcesados[i].datosProcesados.id == datosAux[j].id) {
	// 					//Combinamos todos sus elementos
	// 					combinarJson(datosAux[j], datosProcesados[i].datosProcesados)
	// 				}
	// 			}
	// 		}
	// 	}
	// }

	return datosProcesados
}



async function updateRules() {
	//Comprobamos si las reglas de privacidad han cambiado, y si es asi las volvemos a leer

	//passsing directoryPath and callback function
	fs.readdir(privacyRulesPath, async function(err, files) {
		//handling error
		if (err) {
			return console.log('Unable to scan directory: ' + err)
		}
		//listing all files using forEach
		files.forEach(async function(file) {
			// File es el nombre del archivo. leemos todos los "*.json"

			if (/\.json$/.test(file)) {
				var fileNoExtension = file.slice(0, file.length - 5)

				//Leemos el archivo
				var auxPol = fs.readFileSync(path.join(privacyRulesPath, file))

				//Y comparamos con lo que ya hay guardado

				// console.log('Elemento 1: ' + JSON.stringify(politicsAsRead[fileNoExtension]))
				// console.log('Elemento 2: ' + JSON.stringify(JSON.parse(auxPol)))

				if (JSON.stringify(politicsAsRead[fileNoExtension]) == JSON.stringify(JSON.parse(auxPol))) {
					//Si es igual, no tenemos que crear views
					//console.log('Las politicas son iguales')
				}
				else {
					//Si es distinto, actualizamos el objeto
					politicsAsRead[fileNoExtension] = JSON.parse(auxPol)
					politics[fileNoExtension] = JSON.parse(auxPol)

					// y creamos las nuevas views

					for (var i = 0; i < politics[fileNoExtension].rules.length; i++) {
						if (politics[fileNoExtension].rules[i].action_type == 'GET') {
							//En rule.viewName almacenamos el nombre de la vista, y en rule.columns las columnas que contiene la vista
							//Si en las reglas hay un *, no tenemos que crear una view, puede acceder a toda la tabla
							politics[fileNoExtension].rules[i].viewColumns = await obtainViewColumns(politics[fileNoExtension].rules[i].resource)
							//console.log('viewColumns tras su funcion: ' + politics[fileNoExtension].rules[i].viewColumns)
							if (politics[fileNoExtension].rules[i].viewColumns[0] == '*') {
								politics[fileNoExtension].rules[i].viewName = 'personas'
							}
							else {
								var viewName = await createViewFromViewColumns(politics[fileNoExtension].rules[i], fileNoExtension, i)
								politics[fileNoExtension].rules[i].viewName = viewName
							}
							//console.log(politics[fileNoExtension].rules[i])
						}
					}
				}

				//Una vez leidas las politicas, creamos las views SQL
				//Hay que crear una view para cada regla get dentro de cada politica
			}
		})
	})
}
