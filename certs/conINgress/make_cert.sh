#!/bin/bash

openssl x509 -req -in cert.csr -CA myCA.pem -CAkey myCA.key -CAcreateserial -out api-rest.pem -days 1825 -sha256 -extfile api-rest.ext

openssl x509 -req -in cert.csr -CA myCA.pem -CAkey myCA.key -CAcreateserial -out auth.pem -days 1825 -sha256 -extfile auth.ext

openssl x509 -req -in cert.csr -CA myCA.pem -CAkey myCA.key -CAcreateserial -out priv.pem -days 1825 -sha256 -extfile priv.ext

openssl x509 -req -in cert.csr -CA myCA.pem -CAkey myCA.key -CAcreateserial -out gen.pem -days 1825 -sha256 -extfile gen.ext
