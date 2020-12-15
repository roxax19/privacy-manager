/* ===================================== Librerias ===================================== */

const https = require('https');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet'); //Para HSTS, necesario anadir
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const express = require('express');
const body_parser = require('body-parser'); //necesario anadir
const util = require('util'); // Para "promisify" las querys
const Promise = require('bluebird'); //Para numeros aleatorios
const randomNumber = require('random-number-csprng'); //Para numeros aleatorios
const axios = require('axios'); // probamos con axios para generar http
const QueryString = require('qs');


/* ===================================== Configuramos Express ===================================== */
var app = express();
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(helmet());
app.disable('etag'); //Para desactivar los caches (evitando respuesta 304 Not Modified)

/* ===================================== Parametros SSL ===================================== */
const options = {
	key                : fs.readFileSync('ssl/key.pem'),
	cert               : fs.readFileSync('ssl/priv.pem'),
	dhparam            : fs.readFileSync('ssl/dh-strong-key.pem')
	//Condiciones para el cliente:
	//requestCert        : true,
	//rejectUnauthorized : true
};


/* ================================= Parametros SSL para parte cliente ================================= */
const agentSSL = new https.Agent({
	key  : fs.readFileSync('ssl/key.pem'),
	cert : fs.readFileSync('ssl/priv.pem')
});


/* ================== Conexion con la base de datos (hecha con "factory function" warper para usar await) ================== */
var dbConfig = {
	host     : '10.152.183.137', //mysql master
	//host     : 'mysql-master.default.svc.cluster.local',
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


/* ===================================== Creacion del servidor ===================================== */
const puerto = 8082;
//app.listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto));
https.createServer(options, app).listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto));


/* ===================================== Lectura reglas privacidad ===================================== */

/**
 * Hacemos una lectura inicial de todas las politicas acutales y creamos una view de sql para cada regla get de cada usuario.
 * Luego en cada get que recibimos comprobamos si la query y el filter de las políticas han cambiado. Si han cambiado,
 * borramos la view que existe para ese usuario, y creamos una nuvea. Eso debería ser una función a parte.
 */

const privacyRulesPath = path.join(__dirname, 'politicas');

var politicas = {}

//passsing directoryPath and callback function
fs.readdir(privacyRulesPath, async function (err, files) {
    //handling error
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    } 
    //listing all files using forEach
    files.forEach(async function (file) {
		// File es el nombre del archivo. leemos todos los "*.json"
		
		if(/\.json$/.test(file)){

			var fileNoExtension = file.slice(0,file.length-5)

			//Leemos el archivo y lo guardamos en el objeto politicas
			var auxPol = fs.readFileSync(path.join(privacyRulesPath,file))
			politicas[fileNoExtension] = JSON.parse(auxPol);

			//Una vez leidas las politicas, creamos las views SQL
			//Hay que crear una view para cada regla get dentro de cada politica

			for( var i=0; i<politicas[fileNoExtension].rules.length;i++){
				if(politicas[fileNoExtension].rules[i].action_type== "GET"){

					var nombreVista = await createViewFromRule(politicas[fileNoExtension].rules[i], fileNoExtension, i)

					//Almacenamos el nombre de las vistas para despues poder hacerles una query
					politicas[fileNoExtension].rules[i].nombreVista = nombreVista

					console.log(politicas[fileNoExtension].rules[i])

					
				}
			}
		}
	});	
});

/* ===================================== GET ===================================== */

app.get('/', function(req, res) {

	//console.log('Priv: ' + JSON.stringify(req.query));

	//Primero realizamos las querys a las diferentes vistas que tenga el usuario disponibles

	//HAY QUE CAMBIAR EL PARÁMETRO TIPO DATO A QUERY STRING

	querysAVistas(req.query.clase, req.query.tipoDato)


	tipoAccesoGET(req.query.clase, 'GET', req.query.tipoDato).then((acceso) => {

		if (acceso[0] == 'none') {
			res.send('No tienes acceso al dato.');

		} else if (acceso[0] == 'exact') {
			//Hacemos query a la base directamente
			query(req.query.tipoDato,acceso[1], acceso[2])
				.then((resultado) => {
					res.send(resultado);
				})
				.catch((err) => {
					console.log(err);
					res.send(err);
				});

		} else if (acceso[0] == 'gen') {
			var gen = 'https://10.152.183.203:8083';
			//var gen = 'https://gen.default.svc.cluster.local:8083';
			
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

		} else if (acceso[0] == 'minNoise') {
			//Hacemos llamada a la función de ruido
			query(req.query.tipoDato,acceso[1], acceso[2])
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

		} else if (acceso[0] == 'medNoise') {
			//Hacemos llamada a la función de ruido
			query(req.query.tipoDato,acceso[1], acceso[2])
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

		} else if (acceso[0] == 'maxNoise') {
			//Hacemos llamada a la función de ruido
			query(req.query.tipoDato,acceso[1], acceso[2])
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

/* ===================================== POST ===================================== */

app.post('/', function(req, res) {
	console.log('req.body.clase: ' + req.body.clase);
	console.log('req.body.datos: ' + req.body.datos);

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

/* ===================================== DELETE ===================================== */

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

/* ===================================== Funciones ===================================== */


/**
 * Mira el tipo de acceso que tenemos.
 * Para ello, lee el archivo json con el nombre de la clase que le han mandado
 * @param {string} clase 
 * @param {string} accion 
 * @param {string} tipoDato 
 * 
 * Devuelve un array:
 * "[none, query, filter]" si no tenemos acceso
 * "[exact, query, filter]" si devolvemos el dato sin ninguna privacidad
 * "[gen, query, filter]" si devolvemos una generalizacion del dato (usado para strings)
 * "[noise, query, filter]" si devolvemos el dato con algun tipo de ruido
 */

async function tipoAccesoGET(clase, accion, tipoDato) {

	//Primero tenemos que comprobar el metodo de privacidad que podemos usar
	//Que hacemos si nos pide columnas a las que tiene diferente tipo de acceso?

	//console.log('fun tipoAcceso clase: ' + clase);
	//console.log('fun tipoAcceso tipoDato: ' + tipoDato);

	var politica = fs.readFileSync('politicas/' + clase + '.json');
	var jsonPolitica = JSON.parse(politica);

	//console.log('fun tipoAcceso politica: ' + JSON.stringify(jsonPolitica));

	var result = ["",""];

	var i = 0;
	while (i < jsonPolitica.rules.length && result[0] == '') {
		//Comprobamos que tenemos permitido este tipo de accion
		if(jsonPolitica.rules[i].action_type == accion){
			
			//Leemos el tipo de acceso que tenemos
			result[0]=jsonPolitica.rules[i].privacy_method

			//Leemos los datos a los que tenemos acceso (la query)
			result[1]=jsonPolitica.rules[i].resource

			//Leemos el filtro where de las reglas
			result[2]=jsonPolitica.rules[i].filter
		}else{
			i++;
		}
	}

	//Si no habia ninguna regla que definiera este tipo de acceso, no tenemos acceso
	if (result[0] == '') {
		result[0] = 'none';
	}

	//console.log('fun tipoAcceso devuelve: ' + result);
	return result;
}

async function tipoAccesoAccion(clase, accion) {
	//console.log('fun tipoAccesoAccion clase: ' + clase);

	var politica = fs.readFileSync('politicas/' + clase + '.json');
	var jsonPolitica = JSON.parse(politica);

	//console.log('fun tipoAcceso politica: ' + JSON.stringify(jsonPolitica));

	var boolAccion = 0;

	var i = 0;
	while (i < jsonPolitica.max && boolAccion == 0) {
		for (const accionRegla of jsonPolitica.reglas[i].action) {
			//console.log('fun tipoAccesoAccion accionRegla: ' + accionRegla);
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

/**
 * Realiza una comparacion entre la query del usuario y la que hay en las reglas.
 * Después, manda la query a la base de datos
 * 
 * @param {String} queryUsuario --> estructura SELECT sth WHERE
 * @param {String} queryReglas --> estructura SELECT sth FROM sth 
 * @param {String} whereReglas --> estructura WHERE sth
 * 
 * Devuelve los datos recogidos de la base de datos
 */


async function query(queryUsuario, queryReglas, whereReglas) {

	//Tenemos que implementar el operador INTERSECT para que devuelva una interseccion de la query del usuario y de la query de las reglas
	//despues habrá que hacerla distinta en funcion de si ha filtros WHERE o no
	
	/**
	 * Vamos a tener varios casos
	 * Caso 1: En la regla tenemos un *. En este caso, cogemos el where de la regla y lo añadimos al de la query del usuario
	 * Caso 2: En el usuario tenemos un *. En este caso cogemos el where del usuario, y lo añadimos al de la regla
	 * Caso 3: No hay * en ninguno. Comparamos las columnas a las que nos dejan acceder, y dejamos en la query final solo las que sean comunes
	 * 
	 */

	var queryFinal = ""

	//Hay que comprobar que columnas nos permiten seleccionar en las reglas
	queryReglasArray = queryReglas.split(" ")
	queryUsuarioArray = queryUsuario.split(" ")

	//TENEMOS QUE CONSIDERAR LOS 4 CASOS DENTRO DE TODOS LOS APARTADOS
	//CUANDO ESTE TODO HECHO, HABRIA QUE VER COMO EVITAR SQL INJECT (buscar en internet)

	var usuarioHasWhere = queryUsuarioArray.includes("WHERE")
	
	//Analizamos la primera columna, y hacemos cosas distintas en función de si tenemos permiso general o no
	if(queryReglasArray[1] == "*"){

		//CASO 1 - Reglas tienen *
		console.log('fun query: CASO 1 ')

		if(!usuarioHasWhere && whereReglas === undefined){
			//CASO 1.1 - no where
			console.log('fun query: CASO 1.1')

			queryFinal = queryUsuario + ' FROM personas '

		}else if(usuarioHasWhere && whereReglas === undefined){
			//CASO 1.2 - where en usuario
			console.log('fun query: CASO 1.2')

			queryFinal = 
				queryUsuario.slice(0,queryUsuario.indexOf('WHERE')) +
				' FROM personas ' +
				queryUsuario.slice(queryUsuario.indexOf('WHERE'),queryUsuario.length) //Devuelve la parte con el WHERE			

		}else if(!usuarioHasWhere && !(whereReglas === undefined)){
			//CASO 1.3 - where en reglas
			console.log('fun query: CASO 1.3')

			queryFinal = queryUsuario + ' FROM personas ' + whereReglas

		}else{
			//CASO 1.4 - where en ambos
			console.log('fun query: CASO 1.4')
			queryFinal = 
				queryUsuario.slice(0,queryUsuario.indexOf('WHERE')) +
				'FROM personas' + 
				whereReglas; +
				'AND ' +
				queryUsuario.slice(queryUsuario.indexOf('WHERE')+6,queryUsuario.length) //Devuelve la condicion sin el WHERE

		}


	}else if (queryUsuarioArray[1] == "*"){
		//CASO 2 - el susuario solicita todo, pero en reglas no permite todo
		console.log('fun query: CASO 2 ')

		if(!usuarioHasWhere && whereReglas === undefined){
			//CASO 2.1 - no where
			console.log('fun query: CASO 2.1')

			queryFinal = queryReglas

		}else if(usuarioHasWhere && whereReglas === undefined){
			//CASO 2.2 - where en usuario
			console.log('fun query: CASO 2.2')

			queryFinal =  queryReglas + " " + queryUsuario.slice(queryUsuario.indexOf('WHERE'),queryUsuario.length) //Devuelve la parte con el WHERE		

		}else if(!usuarioHasWhere && !(whereReglas === undefined)){
			//CASO 2.3 - where en reglas
			console.log('fun query: CASO 2.3')

			queryFinal = queryReglas + " " +whereReglas

		}else{
			//CASO 2.4 - where en ambos
			console.log('fun query: CASO 2.4')
			queryFinal = 
				queryReglas + " "
				whereReglas +
				'AND ' +
				queryUsuario.slice(queryUsuario.indexOf('WHERE')+6,queryUsuario.length) //Devuelve la condicion sin el WHERE

		}

	}else{
		//CASO 3
		console.log('fun query: CASO 3 ')

		//Hay que comprarar las columnas que se permiten acceder en los dos lados
		//Primero tenemos que quedarnos solo con las palabras entre SELECT y WHERE
		//Despues tenemos que procesarlas para que no tengan comas
		//Finalmente las comparamos, y dejamos solo las comunes

		//HABRIA QUE COMPROBAR SI TIENEN WHERE EL USUARIO Y LA QUERY, ESO SE TE HA OLVIDAO CAMPEON

		if(usuarioHasWhere){
			const isWhere = (element) => element == "WHERE";
			var indexFinUsuario = queryUsuarioArray.findIndex(isWhere)			
		}else{
			var indexFinUsuario = queryUsuarioArray.length	
		}

		//Empezamos el 1 para saltar el SELECT, y terminamos en el WHERE

		console.log("indexFinUsuario: " + indexFinUsuario)

		for(i=1;i<indexFinUsuario;i++){
			//quitamos la "," a las columnas
			//console.log("usuario: "+queryUsuarioArray[i]+".")
			queryUsuarioArray[i] = queryUsuarioArray[i].replace(",","")
			//console.log("usuario despues: "+queryUsuarioArray[i]+".")
		}
		for(i=1;i<queryReglasArray.length-2;i++){
			//quitamos la "," a las columnas
			//console.log("reglas: "+queryReglasArray[i]+".")
			queryReglasArray[i] = queryReglasArray[i].replace(",","")
			//console.log("reglas despues: "+queryReglasArray[i]+".")
		}

		//Ahora almacenamos las que son iguales 
		var columnas = ""
		for(i=1;i<queryReglasArray.length;i++){

			for(j=1;j<indexFinUsuario;j++){

				// console.log ("usuario posicion "+j +" :"+queryUsuarioArray[j])
				// console.log ("regla posicion "+i +" :"+queryReglasArray[i])

				if(queryReglasArray[i]==queryUsuarioArray[j]){
					columnas = columnas + queryReglasArray[i] + ", "
					// console.log ("Coinciden")
				}
			}
		}
		// console.log("columnas: "+columnas)
		columnas = columnas.slice(0,columnas.length-2)
		// console.log("columnas despues: "+columnas)


		//Y ahora montamos la query.
		// Tenemos que considerar los 4 casos, y luego ya vemos si los podemos reducir o no

		//Tenemos tambien que ver si ha habido columnas en comun o no

		if(columnas == " "){
			return "No tienes permiso para acceder a esos datos"
		}

		
		if(!usuarioHasWhere && whereReglas === undefined){
			//CASO 3.1 - No where ni usuario ni reglas
			console.log('fun query: CASO 3.1 ')
			//Montamos la query de forma normal
			queryFinal = 'SELECT ' + columnas + ' FROM personas ';

		}else if(usuarioHasWhere && whereReglas === undefined){
			//CASO 3.2 - Usuario tiene WHERE, reglas no
			console.log('fun query: CASO 3.2')

			queryFinal = 
				'SELECT ' + 
				columnas + 
				' FROM personas ' + 
				queryUsuario.slice(queryUsuario.indexOf('WHERE'),queryUsuario.length) //Devuelve la parte con el WHERE

		}else if(!usuarioHasWhere && !(whereReglas === undefined)){
			//CASO 3.3 - Usuairo no tiene WHERE, y las reglas si
			console.log('fun query: CASO 3.3 ')

			queryFinal = 'SELECT ' + columnas + ' FROM personas ' + whereReglas;
		}else{
			// CASO 3.4 - Usuario y reglas tienen where
			console.log('fun query: CASO 3.4 ')

			queryFinal = 
				'SELECT ' + 
				columnas + 
				' FROM personas ' + 
				whereReglas; +
				'AND ' +
				queryUsuario.slice(queryUsuario.indexOf('WHERE')+6,queryUsuario.length) //Devuelve la condicion sin el WHERE
		}		

	}
	
	// console.log('fun query: queryFinal: '+queryFinal)

	try {
		var resultado = await con.query(queryFinal);
	} catch (err) {
		console.log(err);
	}

	// console.log('fun query result: ' + resultado);
	return resultado;

}

async function introduzcoDatos(datos) {
	var datosTroceados = datos.split(', ');

	// console.log(datos);
	// console.log(datosTroceados);

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
	// console.log('me meto en ruido');

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
async function createViewFromRule(rule, nombreArchivo, iteracion){

	var stringQuery =
		'CREATE OR REPLACE VIEW personas_' +
		nombreArchivo +
		'_' +
		iteracion +
		' AS ' +
		rule.resource

	if(!(rule.filter === undefined)){
		stringQuery = stringQuery + ' ' + rule.filter
	}

	//Realizamos las querys
	try {
		var resultado = await con.query(stringQuery);
	} catch (err) {
		console.log(err);
	}

	return 'personas_' + nombreArchivo + '_' + iteracion

}


/**
 * 
 * @param {String} claseUsuario 
 * @param {String} queryUsuario 
 * 
 * Realiza las querys a las vistas que tiene disponibles el usuario,
 * en funcion del metodo de privacidad que puede utilizar
 * 
 * Devuelve: un array de jsons con formato {privacyMethod:____, resultados:____}
 */
async function querysAVistas(claseUsuario, queryUsuario){

	//NO SE PUEDE HACER SELECCION DE COLUMNAS QUE NO EXISTEN.

	/**
	 * Tenemos dos opciones:
	 * - Primero, dejamos una vista por cada regla, y dentro de nuestro objeto regla introducimos un array
	 * de columnas que son las que se definen en esa regla. Reutilizamos la funcion de arriba. Podemos
	 * crear una funcion sencillita que reciba la regla y añada ese campo.
	 * 
	 * - Segundo, creamos solo una vista por cada clase de usuario. Me gusta mas el primero porque asi tenemos
	 * asociadas las columnas de la tabla ya con un privacy method, lo que yo creo que nos sera de ayuda. Ademas
	 * asi nos libramos mejor de los where indiscretos.
	 * 
	 */

	//Formato query usuario : SELECT _____ FROM _____ WHERE _____

	//Quiero modificar la tabla que el usuario solicita por la vista a la que realmente puede acceder

	//Tengo que hacer una query por cada regla con get que tenga el usuario definida

	// console.log("funcion queryAVistas: "+queryUsuario)

	var resultadoFinal = [];
	var queryUsuarioArray = queryUsuario.split(" ")

	for( var i=0; i<politicas[claseUsuario].rules.length;i++){
		if(politicas[claseUsuario].rules[i].action_type== "GET"){

			//Monto la query

			var queryString = ""

			for(var j=0; j<queryUsuarioArray.length;j++){

				if(j == queryUsuarioArray.indexOf("FROM")+1){
					//Si es el nombre de la tabla, lo cambiamos por la vista que le corresponde
					queryString = queryString + politicas[claseUsuario].rules[i].nombreVista + " "

				}else{
					queryString = queryString + queryUsuarioArray[j] + " "					
				}
			}

			//Una vez que esta montada la query, la enviamos a la base de datos

			//Quiero que me devuelva un array con jsons del tipo {privacyMethod:____, resultados:____}
			//y en la funcion principal, podre enviar estos resultados a un sitio u otro en funcion del metodo que utilicen

			try {
				var resultado = await con.query(stringQuery);
			} catch (err) {
				console.log(err);
			}

			ressultadoFinal.push({
				"privacyMethod":politicas[claseUsuario].rules[i].privacyMethod,
				"resultado": resultado
			})
			
		}
	}

	return resultadoFinal

}