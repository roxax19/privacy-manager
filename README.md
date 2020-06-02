# privacy-manager
A privacy system made for my Degree Final Project.

#How to configure

#Step 1
You have to configure your own kubernetes cluster. You need to have a storage class, an ingress class, and a load balancer.

You can easily get this with microk8s, and its addons.

#Step 2
Kubernetes doesn't accept relative pathing inside, so you will have to change the volume hostpath of the following files:

kubernetesFiles/connector/connector.yaml
kubernetesFiles/gen/gen.yaml
kubernetesFiles/nodejs/apiRest.yaml
kubernetesFiles/nodejs/auth.yaml
kubernetesFiles/nodejs/priv.yaml

You have to put the path to the folders inside mount/ on this git.

#Step 3
For deploying the whole system, you have to execute (if you are working with microk8s) kubernetesFiles/execute_yaml.sh. If you aren't, you can copy the kubectl commands and execute in a terminal.

#Step 4
For it to work correctly, you have to enter the phpMyAdmin pod, and create the database and the tables with de following commands:

-Create database
CREATE DATABASE test

-Create "personas" table.

CREATE TABLE `test`.`personas` ( `id` INT NOT NULL AUTO_INCREMENT , `nombre` VARCHAR(255) NOT NULL , `edad` INT NOT NULL , `lat` FLOAT NOT NULL , `lon` FLOAT NOT NULL , `profesion` VARCHAR(255) NOT NULL , `sueldo` INT NOT NULL , `pulso` INT NOT NULL , `temepatura` FLOAT NOT NULL , `enfermedad` VARCHAR(255) NOT NULL , PRIMARY KEY (`id`))

-Insert into "personas"

INSERT INTO `personas` (`id`, `nombre`, `edad`, `lat`, `lon`, `profesion`, `sueldo`, `pulso`, `temepatura`, `enfermedad`) VALUES (NULL, 'Manuel Ruiz Ruiz', '21', '1234', '5678', 'Estudiante', '0', '60', '36', 'Sano'), (NULL, 'Alberto', '22', '123.567', '23.12344', 'Estudiante', '0', '59', '35.4', 'Sano'), (NULL, 'Juan', '34', '534.3521', '5363.3235', 'Ingeniero', '60000', '58', '38', 'Fiebre'), (NULL, 'Alvaro', '64', '984.1234', '734.565', 'Ingeniero', '70000', '66', '35.2', 'Sano'), (NULL, 'Miguel', '23', '546.234', '765.234', 'Médico', '90000', '67', '37.8', 'Fiebre'), (NULL, 'Ana', '3', '543.645', '123.456', 'Estudiante', '0', '61', '36.3', 'Sano'), (NULL, 'Elena', '43', '6.432534', '3.2345234', 'Ingeniero', '30000', '67', '35.8', 'Sano'), (NULL, 'Rocio', '70', '6546.3', '4563.2', 'Jubilado', '20000', '56', '35.4', 'Sano'), (NULL, 'Maria', '33', '867.6456', '342.123', 'Médico', '70000', '63', '36.5', 'Sano'), (NULL, 'Manuel Jesús', '23', '674.56', '4353.345', 'Médico', '50000', '69', '38.2', 'Fiebre') 

-Create "usuarios" table

CREATE TABLE `test`.`personas` ( `id` INT NOT NULL AUTO_INCREMENT , `email` VARCHAR(255) NOT NULL ,`contrasena` VARCHAR(255) NOT NULL , `clase` VARCHAR(255) NOT NULL , PRIMARY KEY (`id`))

-Insert into "usuarios"
INSERT INTO `usuarios` (`id`, `email`, `contrasena`, `clase`) VALUES (NULL, 'a', 'a', 'admin') 


