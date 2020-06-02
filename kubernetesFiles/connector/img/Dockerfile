#hay que bucar una imagen que me permita ejecutar cuando yo quiera python dentro
#la idea es buscar el alpine e instalarle cosas dentro
#recuerda usar la segunda categoria de tags que salen en el dockerhub

FROM python:2.7

#Preparar el directorio dentro de la imagen
RUN mkdir -p /mount
WORKDIR /mount

#instalar las librerias deseadas
RUN pip install paho-mqtt
RUN pip install mysql-connector 

