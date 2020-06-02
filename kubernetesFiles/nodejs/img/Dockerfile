FROM node:12.14

#Preparar el directorio dentro de la imagen
RUN mkdir -p /node
WORKDIR /node

#instalar las librerias deseadas
RUN npm install mysql
RUN npm install express
RUN npm install body-parser
RUN npm install jsonwebtoken
RUN npm install helmet
RUN npm install axios
RUN npm install random-number-csprng

#Cuando nos hemos bajado los modulos, cambiamos de directorio para no machacarlo
RUN mkdir -p /node/mount
WORKDIR /node/mount
